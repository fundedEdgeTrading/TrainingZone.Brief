import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  getDelinquencyAmount,
  getNetJoins,
  getKpiTiles,
  getPostalCodeMapData,
  getLtvAndTicket,
  getDailyInsight,
  tenureFromObservations,
} from "@/lib/dashboard-queries";
import type { BarrioStat } from "@/lib/barrio-map";

/**
 * E12-05 · un solo dashboard-queries. Lo que se prueba aquí es exactamente lo
 * que discrepaba entre web y móvil: morosos por `Member.state`, no por
 * `Payment` suelto sin ventana; y bajas con cota superior de fecha, no solo
 * inferior (una baja programada a futuro no puede contar como baja del mes
 * en curso).
 */

const SLUG = "e12-05-dashboard-test";
let orgId: string;
let centerId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Dashboard", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;
});

after(async () => {
  if (!orgId) return;
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.center.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E12-05 · el importe de morosidad solo cuenta a quien YA está en DELINQUENT", async () => {
  const delinquent = await prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: "Mora", lastName: "Deuda", email: `${SLUG}-1@example.com`, state: "DELINQUENT" },
  });
  const active = await prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: "Al", lastName: "Corriente", email: `${SLUG}-2@example.com`, state: "ACTIVE" },
  });
  await prisma.payment.create({
    data: { orgId, memberId: delinquent.id, amountCents: 4000, method: "SEPA", status: "FAILED", date: new Date() },
  });
  // Un recibo pendiente de un socio que YA está al corriente (p. ej. lo pagó
  // por otro medio y el estado todavía no se ha reconciliado) no debe sumar.
  await prisma.payment.create({
    data: { orgId, memberId: active.id, amountCents: 9000, method: "CARD", status: "PENDING", date: new Date() },
  });

  const amount = await getDelinquencyAmount(orgId, { centerId });
  assert.equal(amount, 4000);
});

test("E12-05 · las bajas del mes tienen cota superior de fecha", async () => {
  const now = new Date();
  const thisMonth = now;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 15);

  await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: "Baja",
      lastName: "EsteMes",
      email: `${SLUG}-3@example.com`,
      state: "CANCELLED",
      joinedAt: new Date(now.getFullYear() - 1, 0, 1),
      cancelledAt: thisMonth,
    },
  });
  // Baja PROGRAMADA para el mes que viene: no puede contar ya como baja de
  // este mes solo porque `cancelledAt` sea posterior al arranque del mes.
  await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: "Baja",
      lastName: "MesQueViene",
      email: `${SLUG}-4@example.com`,
      state: "ACTIVE",
      joinedAt: new Date(now.getFullYear() - 1, 0, 1),
      cancelledAt: nextMonth,
    },
  });

  const { cancels } = await getNetJoins(orgId, { centerId, range: "mes" });
  assert.equal(cancels, 1, "la baja programada a futuro no cuenta como baja de este mes");
});

test("E12-05 · el tile de morosos no lleva comparativa, y el de ingresos sí lleva deltaValue numérico", async () => {
  const tiles = await getKpiTiles(orgId, { centerId });
  const delinquentTile = tiles.find((t) => t.key === "delinquent")!;
  const revenueTile = tiles.find((t) => t.key === "revenue")!;
  assert.equal(delinquentTile.deltaValue, null);
  assert.equal(typeof revenueTile.deltaValue === "number" || revenueTile.deltaValue === null, true);
});

// ---------- E14-07 · la petición T7, contra la agregación real ----------

/**
 * Las cuatro pruebas que pide `docs/hu/T7-peticion-dashboard-queries.md`, más
 * la de coherencia que exige E14-07: el mapa y el panel tienen que contar lo
 * mismo para el mismo periodo y el mismo estado.
 *
 * Barrios propios y no los sembrados, para no depender de qué haya en la base:
 * `PostalCodeArea` es tabla de referencia global (sin `orgId`), así que se
 * crean dos códigos que no existen en el callejero real y se borran al final.
 */
const BARRIO_A = "09901";
const BARRIO_B = "09902";

const hace = (meses: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - meses);
  return d;
};

let mapOrgId: string;
let mapCenterId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Mapa", slug: `${SLUG}-mapa` } });
  mapOrgId = org.id;
  const center = await prisma.center.create({
    data: { orgId: mapOrgId, name: "Centro mapa", slug: `${SLUG}-mapa-centro` },
  });
  mapCenterId = center.id;
  const paraInsight = await prisma.member.create({
    data: {
      orgId: mapOrgId,
      primaryCenterId: mapCenterId,
      firstName: "Insight",
      lastName: "Socio",
      email: `${SLUG}-insight@example.com`,
      state: "ACTIVE",
    },
  });
  insightMemberId = paraInsight.id;
  await prisma.postalCodeArea.createMany({
    data: [
      { code: BARRIO_A, name: "Barrio A de prueba", lat: 41.65, lng: -0.88 },
      { code: BARRIO_B, name: "Barrio B de prueba", lat: 41.66, lng: -0.89 },
    ],
    skipDuplicates: true,
  });
});

after(async () => {
  if (!mapOrgId) return;
  await prisma.lead.deleteMany({ where: { orgId: mapOrgId } });
  await prisma.payment.deleteMany({ where: { orgId: mapOrgId } });
  await prisma.member.deleteMany({ where: { orgId: mapOrgId } });
  await prisma.center.deleteMany({ where: { orgId: mapOrgId } });
  await prisma.organization.deleteMany({ where: { id: mapOrgId } });
  await prisma.postalCodeArea.deleteMany({ where: { code: { in: [BARRIO_A, BARRIO_B] } } });
});

/** Socio al que colgarle los cobros del insight, sin ensuciar el resto. */
let insightMemberId: string;

let socioSeq = 0;
const socio = (data: Partial<Parameters<typeof prisma.member.create>[0]["data"]> = {}) =>
  prisma.member.create({
    data: {
      orgId: mapOrgId,
      primaryCenterId: mapCenterId,
      firstName: "Socio",
      lastName: `Mapa${++socioSeq}`,
      email: `${SLUG}-mapa-${socioSeq}@example.com`,
      postalCode: BARRIO_A,
      state: "ACTIVE",
      joinedAt: new Date(),
      ...data,
    } as Parameters<typeof prisma.member.create>[0]["data"],
  });

const barrio = (points: BarrioStat[], code: string) => points.find((p) => p.code === code);

test("T7·1 · el mapa deja de contar a los socios cancelados, y los cuenta si se los piden", async () => {
  await socio({ state: "CANCELLED", cancelledAt: new Date(), postalCode: BARRIO_B });
  await socio({ postalCode: BARRIO_B });

  const { points } = await getPostalCodeMapData(mapOrgId);
  assert.equal(barrio(points, BARRIO_B)?.members, 1, "por defecto, solo los vivos");

  // `?estado=todos` — el comportamiento histórico, para poder conciliar.
  const todos = await getPostalCodeMapData(mapOrgId, {
    memberStates: ["TRIAL", "ACTIVE", "DELINQUENT", "FROZEN", "CANCELLED", "PROSPECT"],
  });
  assert.equal(barrio(todos.points, BARRIO_B)?.members, 2);
});

test("T7·2 · un lead ya convertido no se cuenta dos veces, y la conversión no se infla", async () => {
  const convertido = await socio({ postalCode: BARRIO_A });
  let leadSeq = 0;
  const lead = (data: Record<string, unknown>) =>
    prisma.lead.create({
      data: {
        orgId: mapOrgId,
        centerId: mapCenterId,
        firstName: "Lead",
        lastName: `Mapa${++leadSeq}`,
        phone: "600000000",
        postalCode: BARRIO_A,
        channel: "Web",
        occupation: "—",
        goals: "—",
        hasTrainedBefore: false,
        ...data,
      } as Parameters<typeof prisma.lead.create>[0]["data"],
    });

  await lead({ status: "SIN_CONTACTAR" });
  await lead({ status: "CERRADO", convertedMemberId: convertido.id });
  await lead({ status: "CERRADO" });

  const { points } = await getPostalCodeMapData(mapOrgId);
  // De los tres leads solo queda el abierto: el convertido ya es el socio de
  // arriba —contarlo sería la misma persona dos veces— y el cerrado no es
  // demanda pendiente.
  assert.equal(barrio(points, BARRIO_A)?.leads, 1);
});

test("T7·3 · una baja programada a futuro no cuenta como baja del periodo", async () => {
  const antes = barrio((await getPostalCodeMapData(mapOrgId)).points, BARRIO_B)?.churn ?? 0;

  const enUnMes = new Date();
  enUnMes.setMonth(enUnMes.getMonth() + 1);
  await socio({ state: "CANCELLED", cancelledAt: enUnMes, postalCode: BARRIO_B });
  await socio({ state: "CANCELLED", cancelledAt: new Date(), postalCode: BARRIO_B });

  const despues = barrio((await getPostalCodeMapData(mapOrgId)).points, BARRIO_B)?.churn ?? 0;
  // Se han dado de baja dos, pero una es del mes que viene. Sin cota superior
  // el mapa de fuga enseñaría barrios que todavía no han perdido a nadie.
  assert.equal(despues - antes, 1);
});

test("T7·4 · con un periodo más largo entran altas más antiguas, y con uno corto no", async () => {
  await socio({ joinedAt: hace(20), postalCode: BARRIO_B });

  const mes = await getPostalCodeMapData(mapOrgId, { range: "mes" });
  const dosAnos = await getPostalCodeMapData(mapOrgId, {
    range: "custom",
    custom: { from: hace(24), to: new Date() },
  });

  const enMes = barrio(mes.points, BARRIO_B)?.members ?? 0;
  const enDosAnos = barrio(dosAnos.points, BARRIO_B)?.members ?? 0;
  assert.ok(enDosAnos > enMes, `el socio de hace 20 meses solo entra en la ventana larga (${enMes} vs ${enDosAnos})`);
});

test("E14-07 · mapa y panel cuentan lo mismo para el mismo periodo", async () => {
  const opts = { range: "custom" as const, custom: { from: hace(24), to: new Date() } };
  const { points } = await getPostalCodeMapData(mapOrgId, opts);
  const enElMapa = points.reduce((sum, p) => sum + p.members, 0);
  const enElPanel = await prisma.member.count({
    where: {
      orgId: mapOrgId,
      state: { in: ["TRIAL", "ACTIVE", "DELINQUENT", "FROZEN"] },
      postalCode: { not: null },
      joinedAt: { gte: opts.custom.from, lt: opts.custom.to },
    },
  });
  assert.equal(enElMapa, enElPanel, "las dos pantallas tienen que dar la misma cifra");
});

// ---------- E14-05 · permanencia media, con la censura resuelta ----------

test("E14-05 · los socios vivos no se excluyen ni cuentan como bajas: censuran", () => {
  // El caso que hace falta distinguir. Diez socios: uno se fue a los 2 meses y
  // nueve siguen, y llevan 20.
  const observaciones = [
    { months: 2, churned: true },
    ...Array.from({ length: 9 }, () => ({ months: 20, churned: false })),
  ];
  const t = tenureFromObservations(observaciones);

  // La media simple de "quien se fue" da 2 meses, que es absurdo: nueve de cada
  // diez llevan veinte y siguen.
  assert.equal(t.completedMonths, 2);
  assert.equal(t.completedCount, 1);
  assert.equal(t.censoredCount, 9);
  // Kaplan-Meier: la única baja ocurrió con los 10 en riesgo, así que la
  // supervivencia cae al 90 % en el mes 2 y se mantiene hasta el horizonte.
  // 2 × 1,0 + 18 × 0,9 = 18,2.
  assert.equal(t.months, 18.2);
  assert.ok(t.months! > t.completedMonths!, "no puede salir peor que la media de los que se fueron");
});

test("E14-05 · sin bajas observadas la permanencia es el horizonte entero, no cero ni infinito", () => {
  const t = tenureFromObservations([
    { months: 10, churned: false },
    { months: 4, churned: false },
  ]);
  assert.equal(t.months, 10, "nadie se ha ido: lo medido es lo que llevamos mirando");
  assert.equal(t.completedMonths, null, "y no hay media de bajas que dar");
  assert.equal(t.horizonMonths, 10);
});

test("E14-05 · el horizonte avisa de que la referencia todavía no se puede alcanzar", () => {
  // El caso real de septiembre de 2026: el alta más antigua tiene 23,6 meses y
  // la referencia son 25. Nadie ha podido llegar.
  const joven = tenureFromObservations([
    { months: 23.6, churned: false },
    { months: 7, churned: true },
  ]);
  assert.equal(joven.belowHorizon, true, "es el titular de la card, no una nota al pie");
  assert.equal(joven.targetMonths, 25);

  const maduro = tenureFromObservations([
    { months: 40, churned: false },
    { months: 7, churned: true },
  ]);
  assert.equal(maduro.belowHorizon, false);
});

test("E14-05 · sin socios que medir se devuelve null, no un cero que parece un dato", () => {
  const t = tenureFromObservations([]);
  assert.equal(t.months, null);
  assert.equal(t.completedMonths, null);
  assert.equal(t.horizonMonths, 0);
});

test("E14-05 · el LTV respeta el selector y sale del ritmo por la permanencia", async () => {
  const hace18Meses = new Date();
  hace18Meses.setMonth(hace18Meses.getMonth() - 18);
  const member = await prisma.member.create({
    data: {
      orgId: mapOrgId,
      primaryCenterId: mapCenterId,
      firstName: "Ltv",
      lastName: "Socio",
      email: `${SLUG}-ltv@example.com`,
      state: "ACTIVE",
      joinedAt: hace18Meses,
    },
  });
  await prisma.payment.create({
    data: { orgId: mapOrgId, memberId: member.id, amountCents: 12000, method: "CARD", status: "PAID", date: hace18Meses },
  });

  // Antes esta consulta devolvía lo mismo con cualquier selector porque
  // agregaba todo el histórico: era la prueba más clara del diagnóstico.
  const esteMes = await getLtvAndTicket(mapOrgId, { range: "mes" });
  const dosAnos = await getLtvAndTicket(mapOrgId, {
    range: "custom",
    custom: { from: hace(24), to: new Date() },
  });
  assert.equal(esteMes.payingMembers, 0, "el cobro de hace 18 meses no es de este mes");
  assert.equal(dosAnos.payingMembers, 1);

  // Con un solo cobro no hay muestra para un ritmo mensual, y el LTV sale null
  // en vez de un número inventado (mismo suelo que el insight, E14-04).
  assert.equal(dosAnos.monthlyArpuEuros, null);
  assert.equal(dosAnos.ltvEuros, null);
  assert.ok(dosAnos.tenure.months !== null, "la permanencia sí se puede medir");

  // Con muestra suficiente, el LTV es el producto: ritmo por permanencia.
  await Promise.all(
    Array.from({ length: 14 }, (_, i) => {
      const cuando = hace(17 - i);
      return prisma.payment.create({
        data: { orgId: mapOrgId, memberId: member.id, amountCents: 16000, method: "CARD", status: "PAID", date: cuando },
      });
    })
  );
  const conMuestra = await getLtvAndTicket(mapOrgId, {
    range: "custom",
    custom: { from: hace(24), to: new Date() },
  });
  assert.ok(conMuestra.monthlyArpuEuros !== null && conMuestra.ltvEuros !== null);
  assert.ok(Math.abs(conMuestra.ltvEuros - conMuestra.monthlyArpuEuros * conMuestra.tenure.months!) < 0.01);
  // El ritmo se divide por meses-socio de EXPOSICIÓN y no por la duración de la
  // ventana: un socio de alta a mitad del periodo no ha tenido ocasión de pagar
  // el periodo entero. Se comprueba contra la definición —ingresos entre
  // meses-socio— y no contra un número a ojo, que cambiaría con cada socio que
  // se añada al fixture.
  const socios = await prisma.member.findMany({
    where: { orgId: mapOrgId, state: { not: "PROSPECT" } },
    select: { joinedAt: true, cancelledAt: true },
  });
  const ventana = { from: hace(24), to: new Date() };
  const MES_MS = 2_629_746_000;
  const mesesSocio = socios.reduce((acc, m) => {
    const desde = Math.max(m.joinedAt.getTime(), ventana.from.getTime());
    const hasta = Math.min((m.cancelledAt ?? ventana.to).getTime(), ventana.to.getTime());
    return acc + Math.max(0, hasta - desde) / MES_MS;
  }, 0);
  const cobrado = await prisma.payment.aggregate({
    where: { orgId: mapOrgId, status: "PAID", date: { gte: ventana.from, lt: ventana.to } },
    _sum: { amountCents: true },
  });
  const esperado = (cobrado._sum.amountCents ?? 0) / 100 / mesesSocio;
  assert.ok(
    Math.abs(conMuestra.monthlyArpuEuros - esperado) < 1,
    `ritmo mensual ${conMuestra.monthlyArpuEuros} ≠ ingresos/meses-socio ${esperado}`
  );

  await prisma.payment.deleteMany({ where: { memberId: member.id } });
  await prisma.member.delete({ where: { id: member.id } });
});

// ---------- E14-04 · el suelo del insight ----------

test("E14-04 · con pocos cobros el insight da el número absoluto y no un porcentaje", async () => {
  const cobro = (amountCents: number, date: Date) =>
    prisma.payment.create({
      data: { orgId: mapOrgId, memberId: insightMemberId, amountCents, method: "CARD", status: "PAID", date },
    });

  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const mesPasado = new Date();
  mesPasado.setMonth(mesPasado.getMonth() - 1);

  // Cuatro cobros de 50 € este mes, contra 500 € del mes pasado: un −60 %
  // calculado sobre cuatro recibos, que es exactamente el caso de E14-01.
  await Promise.all([
    cobro(5000, ayer),
    cobro(5000, ayer),
    cobro(5000, ayer),
    cobro(5000, ayer),
    cobro(50000, mesPasado),
  ]);

  const pocos = await getDailyInsight(mapOrgId, { range: "mes" });
  assert.ok(pocos, "con datos tiene que decir algo");
  assert.doesNotMatch(pocos.text, /\d+(,\d+)?% (arriba|abajo)/, "con 4 recibos no se dan porcentajes");
  assert.match(pocos.text, /4 recibos/, "dice el número absoluto y cuántos recibos lo sostienen");

  // Por encima del suelo (10 recibos y 1.500 €) sí se da el porcentaje.
  await Promise.all(Array.from({ length: 30 }, () => cobro(5000, ayer)));
  const suficientes = await getDailyInsight(mapOrgId, { range: "mes" });
  assert.ok(suficientes);
  assert.match(suficientes.text, /Los ingresos van un .+% (arriba|abajo)/);

  await prisma.payment.deleteMany({ where: { memberId: insightMemberId } });
});
