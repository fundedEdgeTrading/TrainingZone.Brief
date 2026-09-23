import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcileMemberInvoicePaid, reconcileMemberInvoicePaymentFailed } from "@/lib/member-billing";
import { planRenewalMovements, refillOnRenewal, RENEWAL_CARRYOVER } from "@/lib/stripe-renewal";
import { ledgerBalance } from "@/lib/session-ledger";

/**
 * STR-01 · `invoice.paid` de una renovación recarga el bono y lo deja en el
 * libro. Se prueba por la puerta real (`reconcileMemberInvoicePaid`), contra la
 * base, porque lo que importa es lo que queda escrito: saldo, asientos y fecha
 * de fin, y que una reentrega no los duplique.
 */

const SUFFIX = "e2e-renewal-test";

type Fixture = { orgId: string; subscriptionId: string; stripeSubscriptionId: string };

/** Cuota mensual de 8 sesiones, con 3 sin gastar y un libro que cuadra. */
async function createFixture(tag: string, remaining = 3): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Renovación ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Cuota ${tag}`, type: "MONTHLY", priceCents: 4900, sessionsIncluded: 8 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Socio", lastName: tag, email: `${slug}@example.com` },
  });
  const stripeSubscriptionId = `sub_${slug}`;
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 4900,
      sessionsIncluded: 8,
      sessionsRemaining: remaining,
      stripeSubscriptionId,
    },
  });
  // Apertura del libro coherente con el saldo de partida (alta de 8, 5 gastadas).
  // Un asiento nunca mueve 0: sin consumo, solo la apertura.
  await prisma.sessionLedger.createMany({
    data: [
      { orgId: org.id, subscriptionId: subscription.id, delta: 8, balanceAfter: 8, reason: "PURCHASE" as const },
      ...(remaining !== 8
        ? [{ orgId: org.id, subscriptionId: subscription.id, delta: remaining - 8, balanceAfter: remaining, reason: "BOOKING" as const }]
        : []),
    ],
  });
  return { orgId: org.id, subscriptionId: subscription.id, stripeSubscriptionId };
}

const PERIOD_END = Math.floor(Date.UTC(2026, 10, 23) / 1000);

function invoice(id: string, stripeSubscriptionId: string, billingReason: Stripe.Invoice.BillingReason): Stripe.Invoice {
  return {
    id,
    billing_reason: billingReason,
    parent: { subscription_details: { subscription: stripeSubscriptionId } },
    amount_paid: 4900,
    amount_due: 4900,
    lines: { data: [{ period: { end: PERIOD_END } }] },
  } as unknown as Stripe.Invoice;
}

async function ledgerOf(subscriptionId: string) {
  return prisma.sessionLedger.findMany({ where: { subscriptionId } });
}

/**
 * Los asientos de la renovación (llevan la factura en la nota), en orden
 * lógico. No se ordena por `createdAt`: los dos asientos pueden caer en el
 * mismo milisegundo.
 */
async function renewalEntries(subscriptionId: string) {
  const rows = await prisma.sessionLedger.findMany({ where: { subscriptionId, note: { contains: "factura" } } });
  const order = { EXPIRY: 0, PURCHASE: 1 } as Record<string, number>;
  return rows.sort((a, b) => (order[a.reason] ?? 9) - (order[b.reason] ?? 9));
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.notification.deleteMany({ where: { orgId: org.id } });
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

test("D3 · por defecto las sesiones sobrantes se reinician", () => {
  assert.equal(RENEWAL_CARRYOVER, false);
  assert.deepEqual(planRenewalMovements({ sessionsRemaining: 3, sessionsIncluded: 8, carryover: false }), {
    expiry: -3,
    purchase: 8,
    sessionsRemaining: 8,
  });
  // Nada que recargar: bono ilimitado o plan sin sesiones incluidas.
  assert.equal(planRenewalMovements({ sessionsRemaining: null, sessionsIncluded: 8, carryover: false }), null);
  assert.equal(planRenewalMovements({ sessionsRemaining: 3, sessionsIncluded: null, carryover: false }), null);
});

test("STR-01 · renovación mensual: caduca lo que sobra, recarga el plan y alarga el periodo", async () => {
  const f = await createFixture("ciclo");

  const result = await reconcileMemberInvoicePaid(f.orgId, invoice(`in_${SUFFIX}-ciclo`, f.stripeSubscriptionId, "subscription_cycle"));
  assert.deepEqual(result, { ok: true });

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 8, "el segundo mes arranca con las 8 sesiones del plan, no con 0");
  assert.equal(sub.endDate?.getTime(), PERIOD_END * 1000);

  const ledger = await ledgerOf(f.subscriptionId);
  const renewal = await renewalEntries(f.subscriptionId);
  assert.deepEqual(
    renewal.map((r) => [r.reason, r.delta, r.balanceAfter]),
    [
      ["EXPIRY", -3, 0],
      ["PURCHASE", 8, 8],
    ]
  );
  assert.equal(ledgerBalance(ledger), sub.sessionsRemaining, "el libro cuadra con el saldo");

  const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeInvoiceId: `in_${SUFFIX}-ciclo` } });
  assert.equal(payment.status, "PAID");
});

test("STR-01 · el mismo invoice.paid entregado dos veces recarga una sola vez", async () => {
  const f = await createFixture("repetido");
  const inv = invoice(`in_${SUFFIX}-repetido`, f.stripeSubscriptionId, "subscription_cycle");

  await reconcileMemberInvoicePaid(f.orgId, inv);
  // Entre las dos entregas, el socio gasta una sesión: la reentrega no puede
  // devolvérsela ni recargar de nuevo.
  await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { sessionsRemaining: 7 } });
  await prisma.sessionLedger.create({
    data: { orgId: f.orgId, subscriptionId: f.subscriptionId, delta: -1, balanceAfter: 7, reason: "BOOKING" },
  });
  await reconcileMemberInvoicePaid(f.orgId, inv);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 7);
  const purchases = await prisma.sessionLedger.count({ where: { subscriptionId: f.subscriptionId, reason: "PURCHASE" } });
  assert.equal(purchases, 2, "el alta y UNA renovación");
  assert.equal(await prisma.payment.count({ where: { orgId: f.orgId } }), 1);
});

test("STR-01 · contrato P4: el adelanto de pago (subscription_update) recarga igual que un ciclo", async () => {
  const f = await createFixture("adelanto", 5);

  await reconcileMemberInvoicePaid(f.orgId, invoice(`in_${SUFFIX}-adelanto`, f.stripeSubscriptionId, "subscription_update"));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 8);
  assert.equal(sub.endDate?.getTime(), PERIOD_END * 1000);
  const renewal = await renewalEntries(f.subscriptionId);
  assert.deepEqual(
    renewal.map((r) => [r.reason, r.delta]),
    [
      ["EXPIRY", -5],
      ["PURCHASE", 8],
    ]
  );
});

test("STR-01 · la factura del alta (subscription_create) no recarga: ya lo hizo el alta", async () => {
  const f = await createFixture("alta", 8);

  await reconcileMemberInvoicePaid(f.orgId, invoice(`in_${SUFFIX}-alta`, f.stripeSubscriptionId, "subscription_create"));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 8, "el primer mes no puede tener 16 sesiones");
  assert.equal((await ledgerOf(f.subscriptionId)).length, 1, "solo el asiento del alta");
});

test("STR-01 · una renovación que falla y Stripe cobra en el reintento recarga una vez", async () => {
  const f = await createFixture("reintento");
  const inv = invoice(`in_${SUFFIX}-reintento`, f.stripeSubscriptionId, "subscription_cycle");

  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  const afterFailure = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(afterFailure.sessionsRemaining, 3, "sin cobro no hay recarga");

  await reconcileMemberInvoicePaid(f.orgId, inv);
  await reconcileMemberInvoicePaid(f.orgId, inv);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 8);
  const purchases = await prisma.sessionLedger.count({ where: { subscriptionId: f.subscriptionId, reason: "PURCHASE" } });
  assert.equal(purchases, 2);
});

test("STR-01 · con carryover, lo que sobra se conserva y el plan se suma encima", async () => {
  const f = await createFixture("carryover");

  const result = await prisma.$transaction((tx) =>
    refillOnRenewal(tx, {
      subscriptionId: f.subscriptionId,
      invoiceId: `in_${SUFFIX}-carryover`,
      billingReason: "subscription_cycle",
      periodEnd: new Date(PERIOD_END * 1000),
      carryover: true,
    })
  );
  assert.equal(result.refilled, true);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 11);
  const ledger = await ledgerOf(f.subscriptionId);
  assert.deepEqual(
    (await renewalEntries(f.subscriptionId)).map((r) => [r.reason, r.delta, r.balanceAfter]),
    [["PURCHASE", 8, 11]],
    "sin caducidad no hay asiento EXPIRY"
  );
  assert.equal(ledgerBalance(ledger), 11);
});
