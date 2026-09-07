import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-auth";
import { featureForMobileRoute } from "@/lib/mobile-feature-routes";
import { GET as briefList } from "@/app/api/mobile/v1/trainer/brief/route";
import { GET as trainerMembers } from "@/app/api/mobile/v1/trainer/members/route";
import { GET as trainerPanel } from "@/app/api/mobile/v1/trainer/panel/route";

/**
 * E6-01 (RB-PLAT-008): la API móvil comprueba el plan contratado.
 *
 * Verificado en ejecución: con la organización demo en `esencial_mes`
 * (`features: []`, sin `salud_aptitud`) y el token del entrenador,
 * `GET /trainer/brief` devolvía **200 con la lista completa** y
 * `GET /trainer/members?filter=alerts` devolvía **200 con
 * `{"light":"RED","zone":"rodilla derecha"}`**. En web esas dos redirigen a
 * `/planes`. Session Brief, semáforo de aptitud, zona de lesión, rangos de
 * composición y feedback 1-10 eran gratis desde la app: fuga de ingresos
 * directa.
 *
 * Además del comportamiento, aquí se fija la parte estructural: que ninguna
 * ruta cubierta por el mapa se quede sin llamar a la guarda. Declararla en
 * `MOBILE_FEATURE_BY_ROUTE` y no aplicarla es exactamente la forma que tendría
 * este fallo la próxima vez.
 */

const SUFFIX = "test-mobile-plan-gate";
const MOBILE_API_DIR = "src/app/api/mobile/v1";

type Fixture = { orgId: string; centerId: string; trainerId: string };
let fx: Fixture;

async function tokenFor(role: Role) {
  return signAccessToken({ sub: fx.trainerId, role, orgId: fx.orgId, centerId: fx.centerId });
}

async function get(handler: (req: NextRequest) => Promise<Response>, path: string, role: Role = "TRAINER") {
  const token = await tokenFor(role);
  return handler(
    new NextRequest(`http://localhost/api/mobile/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  );
}

async function setPlan(plan: string) {
  await prisma.organization.update({ where: { id: fx.orgId }, data: { platformPlan: plan } });
}

/** Ficheros de ruta reales, con su ruta declarada (sin el prefijo de la API). */
function mobileRouteFiles(dir = MOBILE_API_DIR, prefix = ""): { route: string; file: string }[] {
  const found: { route: string; file: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      found.push(...mobileRouteFiles(join(dir, entry.name), `${prefix}/${entry.name}`));
    } else if (entry.name === "route.ts") {
      found.push({ route: prefix, file: join(dir, entry.name) });
    }
  }
  return found;
}

async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  await wipe();
  const org = await prisma.organization.create({
    // Plan Esencial: la organización de la fuga verificada.
    data: { name: "Plan gate", slug: SUFFIX, platformPlan: "esencial_mes", platformStatus: "ACTIVE" },
  });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SUFFIX}-a` } });
  const identity = await prisma.identity.create({
    data: { email: `${SUFFIX}-trainer@example.com`, passwordHash: "x" },
  });
  const trainer = await prisma.user.create({
    data: {
      orgId: org.id,
      identityId: identity.id,
      name: "Entrenador",
      email: identity.email,
      role: "TRAINER",
      centerId: center.id,
    },
  });
  fx = { orgId: org.id, centerId: center.id, trainerId: trainer.id };
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("E6-01 · con plan Esencial, /trainer/brief responde 402 en vez de 200", async () => {
  await setPlan("esencial_mes");
  const res = await get(briefList, "/trainer/brief");
  assert.equal(res.status, 402);

  const body = (await res.json()) as { ok: boolean; error: string; feature?: string };
  assert.equal(body.ok, false);
  // Mensaje útil: la app tiene qué pintar y qué funcionalidad ofrecer, en vez
  // de una pantalla en blanco o un error de permisos.
  assert.match(body.error, /plan/i);
  assert.equal(body.feature, "salud_aptitud");
});

test("E6-01 · /trainer/members tampoco filtra el semáforo ni la zona de lesión", async () => {
  await setPlan("esencial_mes");
  const res = await get(trainerMembers, "/trainer/members?filter=alerts");
  assert.equal(res.status, 402, "era el 200 con {\"light\":\"RED\",\"zone\":\"rodilla derecha\"}");
});

test("E6-01 · 402 y no 403: no es permiso, es plan", async () => {
  await setPlan("esencial_mes");
  // Con 403 la app pintaría "no tienes permiso" a un entrenador que sí lo
  // tiene, y nadie llegaría nunca a la pantalla de planes.
  assert.notEqual((await get(briefList, "/trainer/brief")).status, 403);
});

test("E6-01 · el panel del entrenador NO se gatea: es su día a día", async () => {
  await setPlan("esencial_mes");
  assert.equal((await get(trainerPanel, "/trainer/panel")).status, 200);
});

test("E6-01 · con la funcionalidad contratada, el comportamiento no cambia", async () => {
  await setPlan("avanzado_mes");
  assert.equal((await get(briefList, "/trainer/brief")).status, 200);
  assert.equal((await get(trainerMembers, "/trainer/members")).status, 200);
  await setPlan("esencial_mes");
});

test("E6-01 · toda ruta con gate declarado llama a la guarda", () => {
  // El mapa por sí solo no protege nada: declarar la ruta y no aplicar la
  // guarda deja el mismo 200 de antes. Esto es lo que hace que una ruta hija
  // nueva bajo `/trainer/brief` falle aquí en vez de en producción.
  const sinGuarda = mobileRouteFiles()
    .filter(({ route }) => featureForMobileRoute(route))
    .filter(({ file }) => {
      const src = readFileSync(file, "utf8");
      return !src.includes("requireApiRoute(") && !src.includes("requireApiFeature(");
    })
    .map(({ route }) => route);

  assert.deepEqual(
    sinGuarda,
    [],
    `Rutas gateadas en MOBILE_FEATURE_BY_ROUTE que no llaman a requireApiRoute: ${sinGuarda.join(", ")}`
  );
});
