import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { SIGNUP_HELD_FOR_SUPPORT, provisionDemoOrganization, provisionOrganizationFromCheckout } from "@/lib/provisioning";

/**
 * QA-ALTA-13 · Un checkout de alta (sin `metadata.orgId`) con el email de
 * alguien que ya dirige una organización le cambiaba el plan y le PISABA
 * `platformStripeSubscriptionId` a esa organización, sin autenticar a nadie:
 * bastaba con pagar un plan con el email de otro director. Ahora el alta se
 * retiene para soporte y la organización existente no se toca.
 */

const EMAIL = `qa-alta-13-${Date.now()}@example.com`;
const SESSION_ID = `cs_test_qa_alta_13_${Date.now()}`;
let orgId = "";

before(async () => {
  const provisioned = await provisionDemoOrganization({ planCode: "esencial_mes", email: EMAIL, name: `QA ALTA 13 ${Date.now()}` });
  if (!provisioned.ok) throw new Error(provisioned.error);
  orgId = provisioned.orgId;
  await prisma.organization.update({ where: { id: orgId }, data: { platformStripeSubscriptionId: `sub_original_${Date.now()}` } });
});

after(async () => {
  await prisma.notification.deleteMany({ where: { entityId: SESSION_ID } });
  const orgs = await prisma.organization.findMany({ where: { billingEmail: EMAIL }, select: { id: true } });
  for (const { id } of orgs) {
    await prisma.leadChannel.deleteMany({ where: { orgId: id } });
    await prisma.noCloseReason.deleteMany({ where: { orgId: id } });
    await prisma.invitation.deleteMany({ where: { orgId: id } });
    await prisma.auditLog.deleteMany({ where: { orgId: id } });
    await prisma.user.deleteMany({ where: { orgId: id } });
    await prisma.organization.deleteMany({ where: { id } });
  }
  await prisma.identity.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

function checkoutSession(): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    metadata: { planCode: "elite_mes" },
    customer_details: { email: EMAIL.toUpperCase(), name: "Quien paga", tax_ids: [] },
    customer: "cus_qa_alta_13",
    subscription: "sub_qa_alta_13_ajena",
  } as unknown as Stripe.Checkout.Session;
}

test("QA-ALTA-13 · un alta pagada con el email de un director no toca su organización", async () => {
  const before = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  const result = await provisionOrganizationFromCheckout(checkoutSession());
  assert.equal(result.ok, true, "el evento se da por atendido: reintentarlo no arreglaría nada");
  if (!result.ok) return;
  assert.equal(result.activationUrl, null);

  const afterOrg = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(afterOrg.platformPlan, before.platformPlan, "no se cambia el plan");
  assert.equal(afterOrg.platformStripeSubscriptionId, before.platformStripeSubscriptionId, "nunca se pisa la suscripción");
  assert.equal(afterOrg.platformStripeCustomerId, before.platformStripeCustomerId);
  assert.equal(afterOrg.provisioningSessionId, before.provisioningSessionId);

  assert.equal(
    await prisma.organization.count({ where: { provisioningSessionId: SESSION_ID } }),
    0,
    "tampoco nace una segunda instalación con los datos partidos (RB-ALTA-003)"
  );
});

test("QA-ALTA-13 · el alta retenida queda registrada para soporte, una sola vez", async () => {
  // Stripe reenvía el evento: el segundo intento no duplica el aviso.
  await provisionOrganizationFromCheckout(checkoutSession());

  const held = await prisma.auditLog.findMany({
    where: { action: SIGNUP_HELD_FOR_SUPPORT, entityType: "CheckoutSession", entityId: SESSION_ID },
  });
  assert.equal(held.length, 1);
  assert.equal(held[0]!.orgId, orgId);
  const metadata = held[0]!.metadata as Record<string, unknown>;
  assert.equal(metadata.subscriptionId, "sub_qa_alta_13_ajena");
  assert.equal(metadata.planCode, "elite_mes");
});
