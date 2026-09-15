import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { listAccountingMovements, parseAccountingMonth, totalsOf } from "@/lib/stripe-export";
import {
  FINANCIAL_REPORT_ACTION,
  buildFinancialReport,
  financialReportCsv,
  financialReportFileName,
  logFinancialReport,
  stripeConnectionFor,
} from "@/lib/stripe-reports";

/**
 * HU-ST-26 · Informes financieros de Stripe bajo demanda (P4).
 *
 * Los dos escenarios: que dirección pueda pedir el informe del periodo y
 * descargarlo, y que sin Stripe conectado la sección EXPLIQUE que hace falta
 * conectar cobros en vez de enseñar un botón muerto.
 *
 * El tercer criterio, que no está escrito como escenario pero es la razón del
 * orden de las historias: el informe tiene que dar exactamente las mismas
 * cifras que el extracto contable de HU-ST-25. Si no, no hay contra qué
 * contrastarlo.
 */

const SLUG = "e2e-hu-st-26-informes";

let orgId = "";
let centerId = "";
let memberId = "";
let userId = "";

const OCTUBRE = parseAccountingMonth("2026-10");

async function cleanup() {
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.stripePayout.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.stripeAccount.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Informes P4", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;

  const identity = await prisma.identity.create({ data: { email: `dir-${SLUG}@example.com`, passwordHash: "x" } });
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, email: identity.email, name: "Dirección", role: "OWNER" },
  });
  userId = user.id;

  const member = await prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: "Amaia", lastName: "Roiz", email: `s-${SLUG}@example.com` },
  });
  memberId = member.id;

  const payout = await prisma.stripePayout.create({
    data: {
      orgId,
      stripePayoutId: `po_${SLUG}`,
      amountCents: 4797,
      status: "PAID",
      arrivalDate: new Date(2026, 9, 6),
    },
  });

  await prisma.payment.create({
    data: {
      orgId,
      memberId,
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
      payoutId: payout.id,
    },
  });
  await prisma.payment.create({
    data: {
      orgId,
      memberId,
      amountCents: 3000,
      method: "CASH",
      status: "PAID",
      date: new Date(2026, 9, 8, 10, 0),
      notes: "Matrícula",
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("HU-ST-26 · sin Stripe conectado se explica el motivo, no se da un informe a medias", async () => {
  const conexion = await stripeConnectionFor(orgId);
  assert.equal(conexion.connected, false);
  assert.equal(typeof conexion.reason, "string");
  assert.notEqual(conexion.reason.length, 0, "el motivo es lo que la sección enseña: no puede venir vacío");
});

test("HU-ST-26 · sin Stripe conectado la pantalla enseña la explicación y NO el botón", () => {
  // El escenario dice "sin botón muerto", así que lo que se comprueba es la
  // rama: cuando no hay conexión, lo que se pinta es el texto y el enlace a
  // conectar cobros, y el botón de descarga queda en la otra rama.
  const page = readFileSync("src/app/(app)/billing/contabilidad/page.tsx", "utf8");
  assert.match(page, /hace falta conectar los cobros/i);
  assert.match(page, /href="\/organization"/, "hay que decir por dónde se conecta, no solo que falta");

  const sinConexion = page.indexOf("!conexion.connected || !informe");
  const boton = page.indexOf("request={async () => downloadFinancialReportAction");
  assert.ok(sinConexion !== -1 && boton !== -1);
  assert.ok(sinConexion < boton, "el botón vive en la rama de 'conectado', después de la explicación");
});

test("HU-ST-26 · el informe del periodo se pide y sale, aunque Stripe no conteste el saldo", async () => {
  const informe = await buildFinancialReport(orgId, {
    from: OCTUBRE.from,
    to: OCTUBRE.to,
    periodLabel: OCTUBRE.label,
    scopeLabel: "Toda la organización",
  });

  // Sin cuenta conectada no hay saldo: el informe sale igual, con su motivo.
  assert.equal(informe.balance, null);
  assert.notEqual(informe.balanceError, null);

  assert.equal(informe.totals.grossCents, 7900);
  assert.equal(informe.totals.feeCents, 103);
  assert.equal(informe.totals.netCents, 7797);
  assert.equal(informe.reconciliation.payoutsTotalCents, 4797);
  assert.equal(informe.reconciliation.balanced, true);
});

test("HU-ST-26 · el informe cuadra con el extracto contable de HU-ST-25", async () => {
  // La razón del orden de las historias: dos agregaciones distintas de lo
  // mismo son dos verdades, y la gestoría las compara.
  const movimientos = await listAccountingMovements(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
  const extracto = totalsOf(movimientos);
  const informe = await buildFinancialReport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });

  assert.deepEqual(informe.totals, extracto);
  // Y el desglose por método suma exactamente el total del extracto.
  assert.equal(
    informe.byMethod.reduce((total, m) => total + m.netCents, 0),
    extracto.netCents
  );
});

test("HU-ST-26 · el fichero descargable lleva resumen, métodos, liquidación y formato español", async () => {
  const informe = await buildFinancialReport(orgId, {
    from: OCTUBRE.from,
    to: OCTUBRE.to,
    periodLabel: OCTUBRE.label,
    scopeLabel: "Toda la organización",
  });
  const csv = financialReportCsv(informe);

  assert.equal(csv.charCodeAt(0), 0xfeff, "BOM");
  assert.match(csv, /^﻿INFORME FINANCIERO/);
  assert.match(csv, /Periodo: Octubre de 2026/);
  assert.match(csv, /Bruto cobrado;79,00/);
  assert.match(csv, /Comisión de Stripe;1,03/);
  assert.match(csv, /Neto real;77,97/);
  assert.match(csv, /POR MÉTODO DE COBRO;Cobros;BrutoEuros;ComisionEuros;NetoEuros/);
  assert.match(csv, /Tarjeta;1;49,00;1,03;47,97/);
  assert.match(csv, /Efectivo;1;30,00;0,00;30,00/);
  assert.match(csv, /Payouts liquidados en el periodo;47,97/);
  assert.match(csv, /Cuadra;Sí/);
  assert.match(csv, /No se pudo leer el saldo;/, "sin saldo se dice por qué, no se deja en blanco");

  assert.match(financialReportFileName(OCTUBRE.from, OCTUBRE.to), /^informe-financiero-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
});

test("HU-ST-26 · ámbito de centro: el informe de un centro no suma los cobros de otro", async () => {
  const otro = await prisma.center.create({ data: { orgId, name: "Centro B", slug: `${SLUG}-b` } });
  const socioB = await prisma.member.create({
    data: { orgId, primaryCenterId: otro.id, firstName: "Rubén", lastName: "Setién", email: `b-${SLUG}@example.com` },
  });
  await prisma.payment.create({
    data: {
      orgId,
      memberId: socioB.id,
      amountCents: 9900,
      method: "CARD",
      status: "PAID",
      date: new Date(2026, 9, 9, 10, 0),
      notes: "Cuota del otro centro",
      grossAmountCents: 9900,
      feeAmountCents: 200,
      netAmountCents: 9700,
    },
  });

  const informe = await buildFinancialReport(orgId, {
    from: OCTUBRE.from,
    to: OCTUBRE.to,
    centerIds: [centerId],
  });
  assert.equal(informe.totals.grossCents, 7900, "los 99,00 € del otro centro no entran");
  assert.equal(informe.reconciliation.orgWide, false);

  const completo = await buildFinancialReport(orgId, { from: OCTUBRE.from, to: OCTUBRE.to });
  assert.equal(completo.totals.grossCents, 17800);
});

test("HU-ST-26 · pedir el informe deja rastro en AuditLog", async () => {
  await logFinancialReport({ orgId, actorUserId: userId, from: OCTUBRE.from, to: OCTUBRE.to, centerIds: [centerId] });

  const fila = await prisma.auditLog.findFirstOrThrow({
    where: { orgId, action: FINANCIAL_REPORT_ACTION },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(fila.actorUserId, userId);
  const metadata = fila.metadata as { from: string; centerIds: string[] };
  assert.equal(metadata.from, OCTUBRE.from.toISOString());
  assert.deepEqual(metadata.centerIds, [centerId]);
});
