import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcilePlatformInvoicePaid, reconcilePlatformInvoicePaymentFailed } from "@/lib/platform-billing";
import { resolveInvoicePeriodEnd, resolveInvoiceSubscriptionId } from "@/lib/stripe-invoice";

/**
 * HU-ST-02 · El plano 1 leía `invoice.subscription`, un campo que la API vigente
 * (`2026-07-29.dahlia`, SDK 22.5.0) ya no entrega: `subscriptionId` salía
 * siempre null, así que `invoice.paid` nunca renovaba y `invoice.payment_failed`
 * nunca ponía PAST_DUE. Un gimnasio que dejaba de pagar la licencia conservaba
 * el acceso para siempre.
 */

const SLUG = "e2e-platform-billing-test";
const PERIOD_END = Math.floor(Date.now() / 1000) + 30 * 86_400;

/** Shape ACTUAL: la suscripción cuelga de `parent.subscription_details`. */
function currentInvoice(subscriptionId: string, lines = [{ period: { end: PERIOD_END } }]): Stripe.Invoice {
  return {
    id: `in_${subscriptionId}`,
    parent: { subscription_details: { subscription: subscriptionId } },
    lines: { data: lines },
  } as unknown as Stripe.Invoice;
}

/** Shape LEGADO: cuentas pinneadas a una versión antigua de la API. */
function legacyInvoice(subscriptionId: string): Stripe.Invoice {
  return {
    id: `in_legacy_${subscriptionId}`,
    subscription: subscriptionId,
    lines: { data: [{ period: { end: PERIOD_END } }] },
  } as unknown as Stripe.Invoice;
}

async function createOrg(tag: string) {
  const subscriptionId = `sub_${SLUG}-${tag}`;
  const org = await prisma.organization.create({
    data: {
      name: `Licencia ${tag}`,
      slug: `${SLUG}-${tag}`,
      platformStatus: "ACTIVE",
      platformStripeSubscriptionId: subscriptionId,
    },
  });
  return { orgId: org.id, subscriptionId };
}

async function cleanup() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: SLUG } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("resolveInvoiceSubscriptionId acepta el shape vigente y el legado", () => {
  assert.equal(resolveInvoiceSubscriptionId(currentInvoice("sub_A")), "sub_A");
  assert.equal(resolveInvoiceSubscriptionId(legacyInvoice("sub_B")), "sub_B");
  assert.equal(resolveInvoiceSubscriptionId({ id: "in_x" } as unknown as Stripe.Invoice), null);
});

test("el fin de periodo es el MÁXIMO de las líneas, no la primera", () => {
  // Una factura de prorrateo trae el crédito del periodo que se cierra y el
  // cargo del nuevo: con `lines[0]` el currentPeriodEnd podía retroceder.
  const invoice = currentInvoice("sub_prorrateo", [
    { period: { end: PERIOD_END - 30 * 86_400 } },
    { period: { end: PERIOD_END } },
  ]);
  assert.equal(resolveInvoicePeriodEnd(invoice)?.getTime(), PERIOD_END * 1000);
});

test("una renovación cobrada deja la licencia ACTIVE y mueve el fin de periodo", async () => {
  const { orgId, subscriptionId } = await createOrg("renovacion");
  await prisma.organization.update({ where: { id: orgId }, data: { platformStatus: "PAST_DUE" } });

  await reconcilePlatformInvoicePaid(currentInvoice(subscriptionId));

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.platformStatus, "ACTIVE");
  assert.equal(org.currentPeriodEnd?.getTime(), PERIOD_END * 1000);
});

test("el impago de la licencia pone la organización en PAST_DUE", async () => {
  const { orgId, subscriptionId } = await createOrg("impago");

  await reconcilePlatformInvoicePaymentFailed(currentInvoice(subscriptionId));

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.platformStatus, "PAST_DUE", "un gimnasio que no paga no puede seguir ACTIVE");
});

test("una cuenta pinneada a la API antigua se resuelve igual", async () => {
  const { orgId, subscriptionId } = await createOrg("legado");

  await reconcilePlatformInvoicePaymentFailed(legacyInvoice(subscriptionId));

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.platformStatus, "PAST_DUE");
});

test("una reentrega del mismo evento deja el estado idéntico", async () => {
  const { orgId, subscriptionId } = await createOrg("reentrega");

  await reconcilePlatformInvoicePaid(currentInvoice(subscriptionId));
  const primera = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  await reconcilePlatformInvoicePaid(currentInvoice(subscriptionId));
  const segunda = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });

  assert.equal(segunda.platformStatus, primera.platformStatus);
  assert.equal(segunda.currentPeriodEnd?.getTime(), primera.currentPeriodEnd?.getTime());
});

test("una factura de una suscripción que no conocemos no escribe nada", async () => {
  const { orgId } = await createOrg("ajena");

  await reconcilePlatformInvoicePaymentFailed(currentInvoice("sub_de_otro_sistema"));

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.platformStatus, "ACTIVE");
});
