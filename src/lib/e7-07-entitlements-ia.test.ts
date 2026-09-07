import "dotenv/config";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { orgHasFeature, orgHasFeatureNow } from "@/lib/entitlements";
import { getPlatformPlan, AVANZADO_AI_GENERATIONS_PER_MONTH } from "@/lib/platform-plans";
import { cleanupRegressionOrgs, E7_07_PREFIX } from "@/lib/e7-07-fixture";

/**
 * E7-07 · U9 — quién tiene `ia_programacion`, y que la generación se rechace
 * ANTES de llamar al proveedor.
 *
 * **Aviso de discrepancia con el enunciado.** El escenario de la historia dice
 * "`orgHasFeature("ia_programacion")` es false en Esencial **y Avanzado**". Eso
 * era cierto antes de E6-04: la decisión **D-P5** reempaquetó el catálogo y
 * metió la IA en Avanzado **con cupo** (`aiGenerationsPerMonth`, hoy 20/mes).
 * Como las decisiones de negocio no se reabren —"si una historia contradice una
 * de estas filas, la historia está mal escrita"—, el test fija el catálogo
 * vigente: false en Esencial y en Fundador, true en Avanzado y Élite. Queda
 * anotado para el integrador.
 *
 * Lo que no cambia, y es lo que de verdad protege este caso, es la segunda
 * mitad: la IA es el único módulo con coste marginal real (~0,18 $ por
 * generación, facturados a Apta), así que el gate va **antes** de preparar la
 * ficha del socio y de llamar al modelo. Si estuviera después, una organización
 * sin la funcionalidad seguiría costando dinero en cada intento —y habría
 * mandado los datos del socio al proveedor por el camino—.
 */

const PLANS = [
  { code: "esencial_mes", expected: false },
  { code: "esencial_ano", expected: false },
  { code: "avanzado_mes", expected: true },
  { code: "avanzado_ano", expected: true },
  { code: "elite_mes", expected: true },
  { code: "elite_ano", expected: true },
  // Funcionalidad de Avanzado a perpetuidad pero SIN IA: un cupo mensual dentro
  // de un pago único es exactamente como envejecen mal las ofertas de por vida.
  { code: "fundador", expected: false },
] as const;

/** Prefijo propio: cada fichero de la batería limpia solo lo suyo. */
const TAG = "u9-planes";

const orgIds = new Map<string, string>();

before(async () => {
  await cleanupRegressionOrgs(TAG);
  for (const { code } of PLANS) {
    const org = await prisma.organization.create({
      data: {
        name: `Plan ${code}`,
        slug: `${E7_07_PREFIX}-${TAG}-${code}`,
        platformPlan: code,
        platformStatus: "ACTIVE",
      },
    });
    orgIds.set(code, org.id);
  }
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

test("U9 · Esencial no incluye ia_programacion, en la tabla y contra la base", async () => {
  for (const { code, expected } of PLANS) {
    const plan = getPlatformPlan(code);
    assert.ok(plan, `${code} tiene que existir en el catálogo`);
    assert.equal(
      plan.features.includes("ia_programacion"),
      expected,
      `el catálogo dice otra cosa de ${code}`
    );
    assert.equal(
      await orgHasFeatureNow(orgIds.get(code)!, "ia_programacion"),
      expected,
      `una organización real en ${code} responde distinto que su plan`
    );
  }
});

test("U9 · Avanzado la incluye CON cupo, que es lo que la distingue de Élite", async () => {
  // D-P5/E6-04: si el cupo desapareciera, Avanzado pasaría a vender IA
  // ilimitada por 129 €/mes con coste variable nuestro.
  assert.equal(getPlatformPlan("avanzado_mes")!.aiGenerationsPerMonth, AVANZADO_AI_GENERATIONS_PER_MONTH);
  assert.equal(getPlatformPlan("avanzado_ano")!.aiGenerationsPerMonth, AVANZADO_AI_GENERATIONS_PER_MONTH);
  assert.equal(getPlatformPlan("elite_mes")!.aiGenerationsPerMonth, undefined, "Élite no tiene cupo propio");
});

test("U9 · una organización suspendida pierde la funcionalidad aunque su plan la traiga", async () => {
  const elite = orgIds.get("elite_ano")!;
  await prisma.organization.update({ where: { id: elite }, data: { platformStatus: "SUSPENDED" } });

  assert.equal(
    await orgHasFeatureNow(elite, "ia_programacion"),
    false,
    "impagar y seguir generando con IA a nuestra cuenta es la peor combinación posible"
  );
  assert.equal(
    orgHasFeature({ platformPlan: "elite_ano", platformStatus: "SUSPENDED" }, "salud_aptitud"),
    false
  );

  await prisma.organization.update({ where: { id: elite }, data: { platformStatus: "ACTIVE" } });
  assert.equal(await orgHasFeatureNow(elite, "ia_programacion"), true);
});

test("U9 · una organización sin plan contratado no tiene ninguna funcionalidad", async () => {
  const org = await prisma.organization.create({
    data: { name: "Sin plan", slug: `${E7_07_PREFIX}-${TAG}-sin-plan`, platformStatus: "ACTIVE" },
  });
  for (const feature of ["ia_programacion", "salud_aptitud", "bi_avanzado"] as const) {
    assert.equal(await orgHasFeatureNow(org.id, feature), false);
  }
});

test("U9 · el gate va ANTES de preparar la ficha y de llamar al proveedor", async () => {
  // Este es el orden que hace que un intento sin plan no cueste dinero ni saque
  // datos del socio. Se comprueba sobre el fuente porque es una propiedad del
  // ORDEN de las llamadas, no de su resultado: las dos funciones que van
  // después (`getMesocycleBriefingForMember`, el único punto por el que salen
  // datos del socio, y `generateMesocyclePlan`, que llama al modelo) no se
  // pueden ejecutar desde aquí sin una sesión de navegador.
  const source = readFileSync("src/app/(app)/members/[id]/mesociclos/actions.ts", "utf8");

  const gate = source.indexOf('orgHasFeatureNow(session.user.orgId, "ia_programacion")');
  const briefing = source.indexOf("getMesocycleBriefingForMember(");
  const provider = source.indexOf("generateMesocyclePlan(");

  assert.ok(gate > -1, "el gate de ia_programacion tiene que seguir en la acción de generar");
  assert.ok(briefing > -1 && provider > -1);
  assert.ok(gate < briefing, "cobrar después de seudonimizar y auditar es cobrar tarde");
  assert.ok(gate < provider, "y llamar al modelo sin plan es coste nuestro por una venta que no existe");

  // Refinar también llama al modelo, así que también lo declara.
  const refine = source.indexOf("export async function refineMesocycleAction");
  assert.ok(
    source.indexOf('orgHasFeatureNow(session.user.orgId, "ia_programacion")', refine) > refine,
    "refinar es la otra puerta al proveedor y necesita el mismo gate"
  );
});

test("U9 · la API móvil declara el mismo gate para la misma operación", async () => {
  // La paridad que más veces se ha roto: la web comprueba y el espejo móvil no.
  const route = readFileSync("src/app/api/mobile/v1/trainer/members/[id]/mesocycles/route.ts", "utf8");
  assert.ok(route.includes('requireApiFeature(claims, "ia_programacion")'));
});
