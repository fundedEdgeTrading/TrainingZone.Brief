import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  ACCOUNTING_DECLARATION,
  ACCOUNTING_EXPORT_ACTION,
  buildAccountingExport,
  listAccountingMovements,
  logAccountingExport,
  parseAccountingMonth,
  recentAccountingMonths,
  totalsOf,
} from "@/lib/stripe-export";

/**
 * HU-ST-25 · Exportación contable para la gestoría (RB-BI-023, decisión D-S8).
 *
 * El escenario principal es el CUADRE, y se prueba sumando de verdad: se leen
 * las cifras del CSV generado, se suman y se comparan contra la suma de los
 * payouts liquidados. Comprobar que la columna "NetoEuros" existe no habría
 * cazado ninguno de los fallos que este cuadre tiene que cazar.
 */

const SLUG = "e2e-hu-st-25-contable";

let orgId = "";
let centerAId = "";
let centerBId = "";
let memberAId = "";
let memberBId = "";
let userId = "";
let payoutRowId = "";

/** Lee las filas de la tabla de movimientos del CSV ya generado. */
function tabla(csv: string): string[][] {
  const lineas = csv.replace(/^﻿/, "").split("\r\n");
  const cabecera = lineas.findIndex((l) => l.startsWith("Fecha;Socio;Concepto"));
  assert.notEqual(cabecera, -1, "el CSV tiene que llevar la cabecera de la tabla");
  const filas: string[][] = [];
  for (const linea of lineas.slice(cabecera + 1)) {
    if (linea === "" || linea.startsWith("TOTAL;")) break;
    filas.push(linea.split(";"));
  }
  return filas;
}

/** "1.234,56" → céntimos. La gestoría lee comas; el test también. */
function centimos(celda: string): number {
  return Math.round(Number(celda.replace(/\./g, "").replace(",", ".")) * 100);
}

async function cleanup() {
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.stripePayout.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Contable P4", slug: SLUG } });
  orgId = org.id;

  const centerA = await prisma.center.create({ data: { orgId, name: "Centro A", slug: `${SLUG}-a` } });
  const centerB = await prisma.center.create({ data: { orgId, name: "Centro B", slug: `${SLUG}-b` } });
  centerAId = centerA.id;
  centerBId = centerB.id;

  const identity = await prisma.identity.create({
    data: { email: `dir-${SLUG}@example.com`, passwordHash: "x" },
  });
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, email: identity.email, name: "Dirección", role: "OWNER" },
  });
  userId = user.id;

  const memberA = await prisma.member.create({
    data: { orgId, primaryCenterId: centerAId, firstName: "Amaia", lastName: "Roiz", email: `a-${SLUG}@example.com` },
  });
  const memberB = await prisma.member.create({
    data: { orgId, primaryCenterId: centerBId, firstName: "Rubén", lastName: "Setién", email: `b-${SLUG}@example.com` },
  });
  memberAId = memberA.id;
  memberBId = memberB.id;

  // Un payout liquidado el 5 de octubre con dos cobros dentro: 49,00 € menos
  // 1,03 € y 60,00 € menos 1,19 €.
  const payout = await prisma.stripePayout.create({
    data: {
      orgId,
      stripePayoutId: `po_${SLUG}`,
      amountCents: 4900 - 103 + (6000 - 119),
      status: "PAID",
      arrivalDate: new Date(2026, 9, 5),
    },
  });
  payoutRowId = payout.id;

  await prisma.payment.create({
    data: {
      orgId,
      memberId: memberAId,
      amountCents: 4900,
      method: "CARD",
      status: "PAID",
      date: new Date(2026, 9, 2, 10, 0),
      notes: "Cuota mensual",
      stripePaymentIntentId: `pi_${SLUG}_a`,
      stripeBalanceTransactionId: `txn_${SLUG}_a`,
      grossAmountCents: 4900,
      feeAmountCents: 103,
      netAmountCents: 4797,
      payoutId: payoutRowId,
    },
  });
  await prisma.payment.create({
    data: {
      orgId,
      memberId: memberBId,
      amountCents: 6000,
      method: "SEPA",
      status: "PAID",
      date: new Date(2026, 9, 3, 10, 0),
      notes: "Bono 10 sesiones",
      stripePaymentIntentId: `pi_${SLUG}_b`,
      stripeBalanceTransactionId: `txn_${SLUG}_b`,
      grossAmountCents: 6000,
      feeAmountCents: 119,
      netAmountCents: 5881,
      payoutId: payoutRowId,
    },
  });

  // Un cobro de caja: sin Stripe y sin comisión. Entra en el extracto, pero no
  // en el cuadre de payouts, porque ese dinero nunca pasó por Stripe.
  await prisma.payment.create({
    data: {
      orgId,
      memberId: memberAId,
      amountCents: 3000,
      method: "CASH",
      status: "PAID",
      date: new Date(2026, 9, 7, 10, 0),
      notes: "Matrícula",
    },
  });

  // Una devolución parcial de 20,00 € con motivo, dentro del mismo mes.
  await prisma.payment.create({
    data: {
      orgId,
      memberId: memberAId,
      amountCents: 5000,
      method: "CARD",
      status: "REFUNDED",
      date: new Date(2026, 9, 9, 10, 0),
      notes: "Entrenamiento personal",
      stripePaymentIntentId: `pi_${SLUG}_dev`,
      stripeRefundId: `re_${SLUG}`,
      refundedAmountCents: 2000,
      refundedAt: new Date(2026, 9, 14, 12, 0),
      refundReason: "Lesión: sesiones no consumidas",
      grossAmountCents: 5000,
      feeAmountCents: 105,
      netAmountCents: 4895,
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const OCTUBRE = parseAccountingMonth("2026-10");

test("HU-ST-25 · CSV mensual: fecha, socio, concepto, bruto, comisión, neto, método, id de Stripe y payout", async () => {
  const exportacion = await buildAccountingExport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
  const filas = tabla(exportacion.csv);

  const cuota = filas.find((f) => f[2] === "Cuota mensual");
  assert.ok(cuota, "el cobro tiene que estar en el extracto");
  assert.equal(cuota[0], "02/10/2026");
  assert.equal(cuota[1], "Amaia Roiz");
  assert.equal(cuota[3], "49,00", "bruto");
  assert.equal(cuota[4], "1,03", "comisión");
  assert.equal(cuota[5], "47,97", "neto");
  assert.equal(cuota[6], "Tarjeta");
  assert.equal(cuota[7], `pi_${SLUG}_a`, "id de Stripe");
  assert.equal(cuota[8], `po_${SLUG}`, "payout asociado");
});

test("HU-ST-25 · cuadre: la suma de netos del periodo da la suma de payouts liquidados", async () => {
  const exportacion = await buildAccountingExport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });

  // Se suma LEYENDO EL FICHERO, columna a columna, como haría la gestoría.
  const netosLiquidados = tabla(exportacion.csv)
    .filter((fila) => fila[8] !== "")
    .reduce((total, fila) => total + centimos(fila[5]), 0);

  const payout = await prisma.stripePayout.findUniqueOrThrow({ where: { id: payoutRowId } });
  assert.equal(netosLiquidados, payout.amountCents, "suma de netos == suma de payouts liquidados");
  assert.equal(netosLiquidados, 10678);

  assert.equal(exportacion.reconciliation.balanced, true);
  assert.equal(exportacion.reconciliation.payoutsTotalCents, exportacion.reconciliation.netTotalCents);
  assert.match(exportacion.csv, /TOTAL LIQUIDADO;;106,78;106,78;Sí/);
});

test("HU-ST-25 · un payout al que le falta un cobro sale como NO cuadrado", async () => {
  // El fallo que la gestoría tiene que ver en el propio fichero: Stripe liquidó
  // 106,78 € y uno de los dos cobros pierde su enlace con el payout.
  await prisma.payment.update({ where: { stripePaymentIntentId: `pi_${SLUG}_b` }, data: { payoutId: null } });
  try {
    const exportacion = await buildAccountingExport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
    assert.equal(exportacion.reconciliation.balanced, false);
    assert.match(exportacion.csv, /TOTAL LIQUIDADO;;106,78;47,97;No/);
    assert.equal(exportacion.reconciliation.unsettledNetCents, 5881 + 4895, "lo desenganchado no desaparece");
  } finally {
    await prisma.payment.update({ where: { stripePaymentIntentId: `pi_${SLUG}_b` }, data: { payoutId: payoutRowId } });
  }
});

test("HU-ST-25 · devoluciones: en negativo, con su motivo y en su propia fecha", async () => {
  const exportacion = await buildAccountingExport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
  const filas = tabla(exportacion.csv);

  const devolucion = filas.find((f) => f[2].startsWith("Devolución"));
  assert.ok(devolucion, "la devolución tiene que aparecer como movimiento propio");
  assert.equal(devolucion[0], "14/10/2026", "la fecha es la de la devolución, no la del cobro");
  assert.equal(devolucion[3], "-20,00");
  assert.equal(devolucion[5], "-20,00");
  assert.equal(devolucion[9], "Lesión: sesiones no consumidas");
  assert.equal(devolucion[7], `re_${SLUG}`);

  // Y en negativo DE VERDAD: sin apóstrofo delante, o Excel lo trata como texto
  // y la gestoría no puede sumar la columna.
  assert.doesNotMatch(exportacion.csv, /;'-20,00/);
  assert.equal(exportacion.totals.refundedCents, 2000);

  // El neto total del periodo baja exactamente lo devuelto.
  const netoTotal = filas.reduce((total, fila) => total + centimos(fila[5]), 0);
  assert.equal(netoTotal, exportacion.totals.netCents);
  assert.equal(netoTotal, 4797 + 5881 + 3000 + 4895 - 2000);
});

test("HU-ST-25 · formato español: punto y coma, BOM y coma decimal", async () => {
  const { csv } = await buildAccountingExport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
  assert.equal(csv.charCodeAt(0), 0xfeff, "BOM, como en export-ranking-button");
  assert.match(csv, /Fecha;Socio;Concepto;BrutoEuros;ComisionEuros;NetoEuros;Metodo;IdStripe;Payout;Motivo/);
  assert.match(csv, /47,97/, "coma decimal: Excel en español no lee 47.97 como número");
  assert.match(csv, /\r\n/);
});

test("HU-ST-25 · qué NO es: el fichero declara que no es una serie de facturación", async () => {
  const { csv } = await buildAccountingExport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
  const sinBom = csv.replace(/^﻿/, "");

  // Va en la PRIMERA línea: es lo que evita que la gestoría lo trate como libro
  // registro de IVA, y una nota al pie no lo evita.
  assert.equal(sinBom.split("\r\n")[0], ACCOUNTING_DECLARATION[0]);
  assert.match(sinBom, /NO ES UNA SERIE DE FACTURACIÓN/);
  assert.match(sinBom, /Apta factura solo su licencia al centro/);
  assert.match(sinBom, /el centro factura al socio con su propio software/i);
  assert.match(sinBom, /D-S8/);
});

test("HU-ST-25 · ámbito de centro: un CSV no se lleva los cobros de otro centro", async () => {
  const movimientos = await listAccountingMovements(orgId, {
    from: OCTUBRE.from,
    to: OCTUBRE.to,
    centerIds: [centerAId],
  });
  assert.equal(
    movimientos.every((m) => m.centerId === centerAId),
    true
  );
  assert.equal(
    movimientos.some((m) => m.memberName === "Rubén Setién"),
    false,
    "el socio del centro B no puede salir en la exportación del centro A"
  );

  const exportacion = await buildAccountingExport(orgId, {
    from: OCTUBRE.from,
    to: OCTUBRE.to,
    centerIds: [centerAId],
  });
  assert.equal(exportacion.reconciliation.orgWide, false);
  assert.match(exportacion.csv, /Este cuadre es parcial/);

  // Y con el ámbito vacío (alguien sin centro imputado) no se lleva nada.
  const sinCentros = await listAccountingMovements(orgId, { from: OCTUBRE.from, to: OCTUBRE.to, centerIds: [] });
  assert.deepEqual(sinCentros, []);
});

test("HU-ST-25 · el periodo acota: un mes no arrastra los movimientos de otro", async () => {
  const septiembre = parseAccountingMonth("2026-09");
  const movimientos = await listAccountingMovements(orgId, { from: septiembre.from, to: septiembre.to });
  assert.deepEqual(movimientos, [], "todo lo de este juego de datos es de octubre");

  const totales = totalsOf(await listAccountingMovements(orgId, { from: OCTUBRE.from, to: OCTUBRE.to }));
  assert.equal(totales.charges, 4);
  assert.equal(totales.refunds, 1);
});

test("HU-ST-25 · toda exportación deja en AuditLog quién, qué periodo y cuándo", async () => {
  await logAccountingExport({
    orgId,
    actorUserId: userId,
    from: OCTUBRE.from,
    to: OCTUBRE.to,
    centerIds: [centerAId],
    rows: 4,
  });

  const fila = await prisma.auditLog.findFirstOrThrow({
    where: { orgId, action: ACCOUNTING_EXPORT_ACTION },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(fila.actorUserId, userId);
  const metadata = fila.metadata as { from: string; to: string; centerIds: string[]; rows: number };
  assert.equal(metadata.from, OCTUBRE.from.toISOString());
  assert.equal(metadata.to, OCTUBRE.to.toISOString());
  assert.deepEqual(metadata.centerIds, [centerAId]);
  assert.equal(metadata.rows, 4);
});

test("HU-ST-25 · el mes del selector se lee de la URL, y un valor inventado cae en el mes en curso", () => {
  const ahora = new Date(2026, 8, 15);
  assert.equal(parseAccountingMonth("2026-10").id, "2026-10");
  assert.equal(parseAccountingMonth("2026-10").label, "Octubre de 2026");
  assert.equal(parseAccountingMonth(undefined, ahora).id, "2026-09");
  assert.equal(parseAccountingMonth("2026-13", ahora).id, "2026-09");
  assert.equal(parseAccountingMonth("borra-todo", ahora).id, "2026-09");

  // Último día del mes, sin tabla de días por mes: febrero de un año bisiesto.
  const febrero = parseAccountingMonth("2028-02");
  assert.equal(febrero.to.getDate(), 29);

  const meses = recentAccountingMonths(3, ahora);
  assert.deepEqual(
    meses.map((m) => m.id),
    ["2026-09", "2026-08", "2026-07"]
  );
});
