import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { provisionOrganizationFromCheckout } from "@/lib/provisioning";

/**
 * RB-ALTA-002 · `/activar` ya no espera al webhook: si el pago está cobrado,
 * aprovisiona él mismo. Webhook y página pueden llegar a la vez con la misma
 * sesión de checkout; tiene que nacer UNA organización y ninguno de los dos
 * caminos puede fallar.
 */

const STAMP = Date.now();
const EMAIL = `alta-concurrente-${STAMP}@example.com`;
const SESSION_ID = `cs_test_alta_concurrente_${STAMP}`;

after(async () => {
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
    metadata: { planCode: "esencial_mes" },
    customer_details: { email: EMAIL, name: `Alta concurrente ${STAMP}`, tax_ids: [] },
    customer: `cus_alta_concurrente_${STAMP}`,
    subscription: `sub_alta_concurrente_${STAMP}`,
  } as unknown as Stripe.Checkout.Session;
}

test("RB-ALTA-002 · webhook y /activar a la vez crean una sola organización", async () => {
  const results = await Promise.all([
    provisionOrganizationFromCheckout(checkoutSession()),
    provisionOrganizationFromCheckout(checkoutSession()),
  ]);

  for (const result of results) assert.equal(result.ok, true);
  const orgIds = new Set(results.map((r) => (r.ok ? r.orgId : null)));
  assert.equal(orgIds.size, 1, "los dos caminos apuntan a la misma organización");

  const orgs = await prisma.organization.findMany({ where: { provisioningSessionId: SESSION_ID } });
  assert.equal(orgs.length, 1);
  const invitations = await prisma.invitation.count({ where: { orgId: orgs[0].id, type: "OWNER" } });
  assert.equal(invitations, 1, "un único enlace de activación");
});
