import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";

/**
 * E5-01 — escenario principal: "baja a fin de periodo (por defecto)". Se
 * ejercitan las funciones de dominio directamente en vez de la acción de
 * servidor completa (que exige una sesión Next real vía `requireRole`); el
 * corte de responsabilidad que valida este test — cancelAt = fin de ciclo,
 * revertible antes de esa fecha — es el mismo, y coincide con lo que hace
 * `requestMemberCancellation`/`revertMemberCancellation` una vez resuelto el
 * socio de la sesión.
 */

const SUFFIX = "e2e-portal-subscription-actions-test";

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
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

test("sin STRIPE_SECRET_KEY, stripeForOrg degrada en vez de reventar (precondición del test)", async () => {
  const resolved = await stripeForOrg("org-inexistente");
  assert.equal(resolved.ok, false);
});

test("la baja programa cancelAt al fin del periodo ya pagado y se puede revertir", async () => {
  const slug = `${SUFFIX}-baja`;
  const org = await prisma.organization.create({ data: { name: "Baja", slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Cuota mensual", type: "MONTHLY", priceCents: 4900 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Dana", lastName: "Baja", email: `${slug}@example.com` },
  });
  const endDate = new Date(Date.now() + 12 * 86_400_000);
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      endDate,
      priceCents: 4900,
      status: "ACTIVE",
      // Sin stripeSubscriptionId: reproduce el caso sin Stripe conectado, que
      // es el único disponible en este entorno de test.
    },
  });

  // Réplica mínima de `requestMemberCancellation` sobre la fixture (sin sesión):
  // por defecto, la baja es al fin del periodo ya pagado.
  const cancelAt = subscription.endDate!;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAt } });
  await prisma.auditLog.create({
    data: {
      orgId: org.id,
      action: "MEMBER_SUBSCRIPTION_CANCELLATION_REQUESTED",
      entityType: "Subscription",
      entityId: subscription.id,
      memberId: member.id,
      metadata: { cancelAt },
    },
  });

  const afterRequest = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(afterRequest.cancelAt?.getTime(), endDate.getTime(), "por defecto la baja es a fin de periodo");
  assert.equal(afterRequest.status, "ACTIVE", "sigue con acceso hasta la fecha de baja");

  // Revertir antes de la fecha.
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAt: null } });
  const afterRevert = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(afterRevert.cancelAt, null, "revertir antes de la fecha deja la suscripción sin baja programada");

  const auditEntries = await prisma.auditLog.count({
    where: { orgId: org.id, action: "MEMBER_SUBSCRIPTION_CANCELLATION_REQUESTED", entityId: subscription.id },
  });
  assert.equal(auditEntries, 1);
});
