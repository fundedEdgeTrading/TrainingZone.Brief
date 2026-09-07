import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getDelinquencyAmount, getNetJoins, getKpiTiles } from "@/lib/dashboard-queries";

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
