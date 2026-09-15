import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import * as queries from "@/lib/dashboard-queries";
import { DASHBOARD_RANGES, LIVE_MEMBER_STATES, type DashboardRange } from "@/lib/dashboard-range";
import { memberStatesFor } from "@/lib/barrio-map-params";

/**
 * E14-06 · **ninguna consulta del panel puede ignorar el rango en silencio.**
 *
 * El diagnóstico de E14-01 encontró que 21 de las 25 consultas de
 * `dashboard-queries.ts` recibían `opts.range` y no hacían nada con él: unas
 * agregaban todo el histórico bajo un rótulo que sí se movía con el selector, y
 * otras tenían su propia ventana fija. Dos cifras contiguas hablando de
 * periodos distintos.
 *
 * Esta prueba es la que impide que vuelva a pasar sin que nadie se entere. No
 * prohíbe que una consulta tenga su propia ventana —hay tres motivos legítimos
 * y están documentados en `windowOf`—, prohíbe que **no esté declarado**: toda
 * consulta exportada tiene que estar en una de las dos listas de abajo, y una
 * nueva que no esté en ninguna rompe el test en vez de romper la lectura del
 * panel en producción.
 */

/** Métricas de flujo: su salida TIENE que cambiar con el periodo. */
const SIGUEN_EL_PERIODO = [
  "getRevenueSeries",
  "getRevenueByMethod",
  "getLtvAndTicket",
  "getGoalsAggregate",
  "getPostalCodeMapData",
  "getPostalCodeStats",
  "getPostalPanelData",
  "getAcquisitionChannels",
  "getTopServices",
  "getOccupancyByCenter",
  "getOccupancyByWeekday",
  "getNoShowRate",
  "getAverageOccupancy",
  "getNetJoins",
  "getKpiTiles",
  "getDailyInsight",
] as const;

/**
 * Ventana propia declarada, con el motivo. Cada una tiene que decirlo en su
 * rótulo de la pantalla; el motivo se escribe aquí para que quien añada una
 * tenga que pararse a justificarla.
 */
const VENTANA_PROPIA: Record<string, string> = {
  getMemberStateBreakdown: "stock: cuántos socios hay AHORA en cada estado",
  getSexDistribution: "stock: la distribución actual de la base de socios",
  getAgeBrackets: "stock: la distribución actual de edades",
  getMemberDemographics: "stock: quién es el socio de hoy",
  getMembersByService: "stock: qué bonos están vivos ahora mismo",
  getDelinquencyAmount: "stock: cuánto se debe AHORA, no cuánto se debió",
  getWeeklyChurn: "definición propia: las ocho semanas ISO cerradas",
  getMemberRanking: "definición propia: la relación entera con el socio",
  getLeadCloseRate: "definición propia, y vive en leads-queries.ts",
};

const SLUG = "e14-06-scope-test";
let orgId: string;

/** Una ejecución anterior que se cortó a medias no puede impedir la siguiente. */
async function limpiar() {
  const previas = await prisma.organization.findMany({ where: { slug: SLUG }, select: { id: true } });
  for (const { id } of previas) {
    await prisma.booking.deleteMany({ where: { session: { orgId: id } } });
    await prisma.classSession.deleteMany({ where: { orgId: id } });
    await prisma.lead.deleteMany({ where: { orgId: id } });
    await prisma.selfAssessment.deleteMany({ where: { orgId: id } });
    await prisma.clientGoal.deleteMany({ where: { orgId: id } });
    await prisma.payment.deleteMany({ where: { orgId: id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: id } } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: id } });
    await prisma.member.deleteMany({ where: { orgId: id } });
    await prisma.center.deleteMany({ where: { orgId: id } });
    await prisma.organization.delete({ where: { id } });
  }
}

before(async () => {
  await limpiar();
  const org = await prisma.organization.create({ data: { name: "Ámbito", slug: SLUG } });
  orgId = org.id;
  await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
});

after(async () => {
  await limpiar();
  await prisma.$disconnect();
});

/** Toda función exportada que se llame `getX(orgId, opts)`. */
function consultasExportadas(): string[] {
  return Object.entries(queries as Record<string, unknown>)
    .filter(([name, value]) => name.startsWith("get") && typeof value === "function")
    .map(([name]) => name);
}

test("toda consulta del panel declara qué hace con el periodo", () => {
  const sinDeclarar = consultasExportadas().filter(
    (name) => !SIGUEN_EL_PERIODO.includes(name as (typeof SIGUEN_EL_PERIODO)[number]) && !(name in VENTANA_PROPIA)
  );
  assert.deepEqual(
    sinDeclarar,
    [],
    `Consultas nuevas sin declarar qué hacen con opts.range. Añádelas a SIGUEN_EL_PERIODO ` +
      `(si son de flujo) o a VENTANA_PROPIA con su motivo, y que el rótulo de su card lo diga.`
  );
});

test("las consultas de flujo cambian de verdad cuando cambia el periodo", async () => {
  // Un poco de todo, fechado hace trece meses: con el periodo en «Hoy» nada de
  // esto puede aparecer, y con dos años tiene que aparecer todo. Si una
  // consulta ignora el rango, sus dos salidas son idénticas y aquí se ve.
  //
  // Hace falta una fila de cada modelo que consulte el panel: con la base vacía
  // todas las consultas devuelven lo mismo por los dos lados y la prueba pasaría
  // sin probar nada.
  const center = await prisma.center.findFirstOrThrow({ where: { orgId } });
  const hace13Meses = new Date();
  hace13Meses.setMonth(hace13Meses.getMonth() - 13);
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: center.id,
      firstName: "Antiguo",
      lastName: "Socio",
      email: `${SLUG}-1@example.com`,
      state: "ACTIVE",
      joinedAt: hace13Meses,
      postalCode: "50007",
    },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId, name: "Plan de prueba", type: "MONTHLY", priceCents: 5000 },
  });
  await Promise.all([
    prisma.payment.create({
      data: { orgId, memberId: member.id, amountCents: 5000, method: "CARD", status: "PAID", date: hace13Meses },
    }),
    prisma.subscription.create({
      data: { memberId: member.id, planId: plan.id, centerId: center.id, priceCents: 5000, startDate: hace13Meses },
    }),
    prisma.clientGoal.create({ data: { orgId, memberId: member.id, label: "Objetivo", createdAt: hace13Meses } }),
    prisma.selfAssessment.create({
      data: { orgId, memberId: member.id, kind: "mensual", structured: { stalled: true }, createdAt: hace13Meses },
    }),
    prisma.lead.create({
      data: {
        orgId,
        centerId: center.id,
        firstName: "Lead",
        lastName: "Antiguo",
        phone: "600000001",
        postalCode: "50007",
        channel: "Web",
        occupation: "—",
        goals: "—",
        hasTrainedBefore: false,
        createdAt: hace13Meses,
      },
    }),
  ]);

  // La clase lleva una reserva: sin ella, la ocupación por día de la semana
  // sale a cero por los dos lados y la comparación no probaría nada.
  const clase = await prisma.classSession.create({
    data: {
      orgId,
      centerId: center.id,
      name: "Clase antigua",
      classType: "Grupo reducido",
      date: hace13Meses,
      startTime: "18:00",
      endTime: "19:00",
      capacity: 10,
    },
  });
  await prisma.booking.create({
    data: { sessionId: clase.id, memberId: member.id, occurrenceDate: hace13Meses, status: "ATTENDED" },
  });

  const hoy = { range: "dia" as DashboardRange };
  const dosAnos = {
    range: "custom" as DashboardRange,
    custom: { from: new Date(Date.now() - 700 * 86_400_000), to: new Date() },
  };

  const iguales: string[] = [];
  for (const name of SIGUEN_EL_PERIODO) {
    const fn = (queries as Record<string, unknown>)[name] as (o: string, opts: object) => Promise<unknown>;
    const [corto, largo] = await Promise.all([fn(orgId, hoy), fn(orgId, dosAnos)]);
    if (JSON.stringify(corto) === JSON.stringify(largo)) iguales.push(name);
  }

  assert.deepEqual(
    iguales,
    [],
    "Estas consultas devuelven lo mismo con el periodo en «Hoy» que con dos años: reciben opts.range y no lo usan."
  );

});

test("parseRange acepta los siete periodos que ofrece la pantalla", () => {
  // Que el selector pinte un chip que `parseRange` no reconoce es un botón que
  // no hace nada, y no se ve en revisión.
  for (const r of DASHBOARD_RANGES) assert.equal(queries.parseRange(r.id), r.id);
  assert.equal(DASHBOARD_RANGES.length, 7);
});

test("«socios vivos» dice lo mismo en las dos capas que lo definen", () => {
  // AGENTS.md prohíbe la tabla espejo, y aquí hay dos por necesidad: una
  // traduce `?estado=` de la URL (T7/M2) y la otra es el criterio por defecto
  // de la agregación (M1). Si se separan, el mapa y el panel vuelven a contar
  // cosas distintas, que es justo el fallo que arregla E14-07.
  assert.deepEqual([...LIVE_MEMBER_STATES].sort(), [...memberStatesFor("activos")].sort());
});

test("el mapa de barrios no vuelve a recibir el periodo sin aplicarlo", () => {
  // La regresión concreta que costó nueve días (T7 escrita el 6 de septiembre,
  // aplicada el 15): la agregación aceptaba los dos parámetros y no los usaba.
  // Un `grep` es feo, pero es lo único que se rompe si alguien quita el filtro
  // y deja el parámetro en la firma.
  const source = readFileSync("src/lib/dashboard-queries.ts", "utf8");
  const fn = source.slice(source.indexOf("export async function getPostalCodeMapData"));
  const cuerpo = fn.slice(0, fn.indexOf("\n/** \"TRAINING ZONE"));
  assert.match(cuerpo, /opts\.memberStates \?\? LIVE_MEMBER_STATES/, "el filtro de estado se perdió");
  assert.match(cuerpo, /"joinedAt" >= \$\{win\.from\}/, "el periodo dejó de acotar a los socios");
  assert.match(cuerpo, /"createdAt" >= \$\{win\.from\}/, "el periodo dejó de acotar a los leads");
  assert.match(cuerpo, /"cancelledAt" < \$\{win\.to\}/, "la cota superior de las bajas se perdió");
  // Y la que NO lleva ventana del selector, que también es una decisión:
  assert.match(cuerpo, /"joinedAt" >= \$\{previousFrom\}/, "la tendencia tiene sus propias ventanas de 90 días");
});
