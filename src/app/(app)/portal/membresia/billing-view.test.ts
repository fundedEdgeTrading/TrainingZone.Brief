import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getMemberBillingSnapshot } from "./billing-view";

/**
 * E5-02: escenario principal — "Mi membresía" tiene que enseñar el importe de
 * la cuota en curso, cosa que hoy (antes de esta historia) no hacía en
 * ningún sitio. Se prueba `getMemberBillingSnapshot` directamente, sin pasar
 * por Stripe (sin `STRIPE_SECRET_KEY` en CI): el escenario cubre el camino
 * sin conexión de pago, que es exactamente el que degrada sin romper.
 */

const SUFFIX = "e2e-membresia-billing-test";

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("Mi membresía muestra el importe del plan en curso y sus recibos", async () => {
  const slug = `${SUFFIX}-precio`;
  const org = await prisma.organization.create({ data: { name: "Precio", slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Bono 10 sesiones", type: "SESSION_PACK", priceCents: 12000, sessionsIncluded: 10 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Ana", lastName: "Precio", email: `${slug}@example.com` },
  });
  const endDate = new Date(Date.now() + 30 * 86_400_000);
  await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      endDate,
      priceCents: 12000,
      status: "ACTIVE",
    },
  });
  await prisma.payment.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      amountCents: 12000,
      method: "CASH",
      status: "PAID",
      date: new Date(),
      notes: "Bono 10 sesiones",
    },
  });

  const snapshot = await getMemberBillingSnapshot(org.id, member.id);

  assert.equal(snapshot.hasSubscription, true);
  assert.equal(snapshot.priceCents, 12000, "el bono puntual no muestra su importe");
  assert.equal(snapshot.recurring, false, "SESSION_PACK no es recurrente");
  assert.equal(snapshot.nextChargeAt, null, "un bono puntual no tiene próximo cobro");
  assert.equal(snapshot.expiresAt?.getTime(), endDate.getTime(), "el bono puntual debe mostrar su caducidad");
  assert.equal(snapshot.receipts.length, 1);
  assert.equal(snapshot.receipts[0].amountCents, 12000);
  assert.equal(snapshot.receipts[0].downloadable, false, "un cobro en efectivo no tiene comprobante de Stripe");
});

test("una cuota recurrente muestra la fecha del próximo cobro, no la caducidad", async () => {
  const slug = `${SUFFIX}-cuota`;
  const org = await prisma.organization.create({ data: { name: "Cuota", slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Cuota mensual", type: "MONTHLY", priceCents: 4900 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Bea", lastName: "Cuota", email: `${slug}@example.com` },
  });
  const nextCharge = new Date(Date.now() + 15 * 86_400_000);
  await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      endDate: nextCharge,
      priceCents: 4900,
      status: "ACTIVE",
    },
  });

  const snapshot = await getMemberBillingSnapshot(org.id, member.id);

  assert.equal(snapshot.recurring, true);
  assert.equal(snapshot.expiresAt, null, "una cuota recurrente no \"caduca\"");
  assert.equal(snapshot.nextChargeAt?.getTime(), nextCharge.getTime());
});

test("una baja programada o una congelación se reflejan en el snapshot", async () => {
  const slug = `${SUFFIX}-estado`;
  const org = await prisma.organization.create({ data: { name: "Estado", slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Cuota mensual", type: "MONTHLY", priceCents: 4900 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Cris", lastName: "Estado", email: `${slug}@example.com` },
  });
  const pauseUntil = new Date(Date.now() + 20 * 86_400_000);
  await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 4900,
      status: "FROZEN",
      pauseUntil,
    },
  });

  const snapshot = await getMemberBillingSnapshot(org.id, member.id);

  assert.equal(snapshot.status, "FROZEN");
  assert.equal(snapshot.pauseUntil?.getTime(), pauseUntil.getTime());
});
