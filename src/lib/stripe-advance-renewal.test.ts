import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  ADVANCE_RENEWAL_AUDIT_ACTION,
  AdvanceRenewalError,
  advanceRenewal,
  advanceRenewalKey,
  advancedInCurrentPeriod,
  previewAdvanceRenewal,
  type AdvanceRenewalDeps,
} from "@/lib/stripe-advance-renewal";

/**
 * ADV-03 · Adelantar la renovación de la cuota.
 *
 * Stripe va falseado, pero con la única propiedad que importa aquí imitada de
 * verdad: la caché de idempotencia (misma clave + mismos parámetros → misma
 * respuesta; misma clave + otros parámetros → `StripeIdempotencyError`). La
 * base es la real, como el resto de tests de cobros: lo que se comprueba es lo
 * que queda escrito (AuditLog) y lo que NO se toca (`sessionsRemaining`).
 */

const SLUG = "e2e-advance-renewal";
const DAY = 86_400;
const NOW = new Date("2026-09-23T10:00:00.000Z");
const NOW_UNIX = Math.floor(NOW.getTime() / 1000);

type Fixture = { orgId: string; memberId: string; subscriptionId: string; stripeSubscriptionId: string };

async function createFixture(tag: string, over: { planType?: "MONTHLY" | "SESSION_PACK"; cancelAt?: Date } = {}): Promise<Fixture> {
  const slug = `${SLUG}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Adelanto ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Cuota ${tag}`, type: over.planType ?? "MONTHLY", priceCents: 4900, sessionsIncluded: 8 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Socio", lastName: tag, email: `${slug}@example.com` },
  });
  const stripeSubscriptionId = `sub_${slug}`;
  const sub = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 4900,
      sessionsIncluded: 8,
      sessionsRemaining: 0,
      stripeSubscriptionId,
      cancelAt: over.cancelAt ?? null,
    },
  });
  return { orgId: org.id, memberId: member.id, subscriptionId: sub.id, stripeSubscriptionId };
}

type FakeOptions = {
  pmType?: "card" | "sepa_debit";
  /** Resultado del cobro al actualizar. */
  charge?: "succeeds" | "requires_action" | "declined";
};

/** Stripe de mentira con estado: una suscripción y su caché de idempotencia. */
function fakeStripe(stripeSubscriptionId: string, opts: FakeOptions = {}) {
  const periodStart = NOW_UNIX - 20 * DAY;
  const state = {
    sub: {
      id: stripeSubscriptionId,
      status: "active",
      cancel_at: null,
      cancel_at_period_end: false,
      metadata: {} as Record<string, string>,
      pending_update: null as unknown,
      latest_invoice: null as unknown,
      default_payment_method: { id: "pm_1", type: opts.pmType ?? "card" },
      customer: "cus_1",
      items: { data: [{ current_period_start: periodStart, current_period_end: periodStart + 30 * DAY }] },
    },
    updates: [] as { params: unknown; idempotencyKey?: string; stripeAccount?: string }[],
    cache: new Map<string, { body: string; response: unknown }>(),
  };
  const invoice = {
    id: "in_adv",
    hosted_invoice_url: "https://invoice.stripe.com/i/acct_test/in_adv",
    amount_paid: opts.charge === "succeeds" || !opts.charge ? 4900 : 0,
    payments: { data: [{ payment: { type: "payment_intent", payment_intent: "pi_adv" } }] },
  };

  const stripe = {
    subscriptions: {
      retrieve: async () => structuredClone(state.sub),
      update: async (id: string, params: Stripe.SubscriptionUpdateParams, options: Stripe.RequestOptions) => {
        assert.equal(id, stripeSubscriptionId);
        const key = options.idempotencyKey ?? "";
        const body = JSON.stringify(params);
        const cached = state.cache.get(key);
        if (cached) {
          if (cached.body !== body) throw Object.assign(new Error("idempotency"), { type: "StripeIdempotencyError" });
          return structuredClone(cached.response);
        }
        state.updates.push({ params, idempotencyKey: options.idempotencyKey, stripeAccount: options.stripeAccount });
        if (opts.charge === "declined") {
          // Con pending_if_incomplete Stripe no aplica el cambio: lo deja pendiente.
          state.sub.pending_update = { billing_cycle_anchor: NOW_UNIX, metadata: params.metadata };
          state.sub.latest_invoice = { ...invoice };
        } else if (opts.charge === "requires_action") {
          state.sub.pending_update = { billing_cycle_anchor: NOW_UNIX, metadata: params.metadata };
          state.sub.latest_invoice = { ...invoice };
        } else {
          state.sub.metadata = { ...(params.metadata as Record<string, string>) };
          state.sub.items.data[0] = { current_period_start: NOW_UNIX, current_period_end: NOW_UNIX + 30 * DAY };
          state.sub.latest_invoice = { ...invoice };
        }
        const response = structuredClone(state.sub);
        state.cache.set(key, { body, response });
        return response;
      },
    },
    invoices: {
      retrieve: async () => structuredClone(invoice),
      createPreview: async (params: Stripe.InvoiceCreatePreviewParams) => {
        assert.equal(params.subscription_details?.billing_cycle_anchor, "now");
        assert.equal(params.subscription_details?.proration_behavior, "none");
        return { amount_due: 4900, currency: "eur", lines: { data: [{ period: { end: NOW_UNIX + 30 * DAY } }] } };
      },
    },
    paymentIntents: {
      retrieve: async () => ({
        id: "pi_adv",
        status: opts.charge === "requires_action" ? "requires_action" : "requires_payment_method",
      }),
    },
  };

  const deps: AdvanceRenewalDeps = {
    resolveStripe: async () => ({ ok: true, stripe: stripe as unknown as Stripe, accountId: "acct_test" }),
    now: () => NOW,
  };
  return { state, deps };
}

async function assertCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof AdvanceRenewalError, `se esperaba AdvanceRenewalError, llegó ${String(err)}`);
    assert.equal(err.code, code);
    return true;
  });
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
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

test("la clave de idempotencia es una por ciclo, con el formato acordado", () => {
  assert.equal(advanceRenewalKey("org1", "sub_1", 1790000000), "advance:org1:sub_1:1790000000:v1");
});

test("advancedInCurrentPeriod: la marca del adelanto dentro del periodo en curso cuenta; la de otro ciclo no", () => {
  assert.equal(advancedInCurrentPeriod({ advanceRenewalAt: NOW.toISOString() }, NOW_UNIX), true);
  assert.equal(advancedInCurrentPeriod({ advanceRenewalAt: NOW.toISOString() }, NOW_UNIX + 30 * DAY), false);
  assert.equal(advancedInCurrentPeriod({}, NOW_UNIX), false);
});

test("camino feliz: ciclo a hoy, sin prorrata, cobro ya; sessionsRemaining intacto y AuditLog", async () => {
  const f = await createFixture("feliz");
  const { state, deps } = fakeStripe(f.stripeSubscriptionId, { charge: "succeeds" });

  const preview = await previewAdvanceRenewal(f, deps);
  assert.equal(preview.amountCents, 4900);
  assert.equal(preview.nextChargeAt?.getTime(), (NOW_UNIX + 30 * DAY) * 1000);

  const result = await advanceRenewal({ ...f, actorUserId: null }, deps);
  assert.equal(result.status, "paid");
  assert.equal(result.status === "paid" && result.nextChargeAt?.getTime(), (NOW_UNIX + 30 * DAY) * 1000);

  assert.equal(state.updates.length, 1);
  const call = state.updates[0];
  assert.deepEqual(call.params, {
    billing_cycle_anchor: "now",
    proration_behavior: "none",
    payment_behavior: "pending_if_incomplete",
    metadata: { advanceRenewalAt: NOW.toISOString() },
    expand: ["latest_invoice.payments"],
  });
  assert.equal(call.stripeAccount, "acct_test");
  assert.equal(call.idempotencyKey, `advance:${f.orgId}:${f.stripeSubscriptionId}:${NOW_UNIX - 20 * DAY}:v1`);

  // La recarga es del webhook (invoice.paid · subscription_update), no de aquí.
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sessionsRemaining, 0);

  const audit = await prisma.auditLog.findMany({ where: { orgId: f.orgId, action: ADVANCE_RENEWAL_AUDIT_ACTION } });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].entityId, f.subscriptionId);
  assert.equal((audit[0].metadata as { outcome: string }).outcome, "paid");
});

test("3DS: devuelve la factura alojada y no mueve nada; el segundo intento retoma la misma factura", async () => {
  const f = await createFixture("3ds");
  const { state, deps } = fakeStripe(f.stripeSubscriptionId, { charge: "requires_action" });

  const first = await advanceRenewal(f, deps);
  assert.deepEqual(first, { status: "requires_action", hostedInvoiceUrl: "https://invoice.stripe.com/i/acct_test/in_adv" });

  const second = await advanceRenewal(f, deps);
  assert.deepEqual(second, first);
  assert.equal(state.updates.length, 1, "el reintento no lanza otro cambio de ciclo");
});

test("tarjeta rechazada: error tipado con la factura para pagar con otra tarjeta", async () => {
  const f = await createFixture("rechazo");
  const { deps } = fakeStripe(f.stripeSubscriptionId, { charge: "declined" });
  await assert.rejects(advanceRenewal(f, deps), (err: unknown) => {
    assert.ok(err instanceof AdvanceRenewalError);
    assert.equal(err.code, "PAYMENT_FAILED");
    assert.equal(err.hostedInvoiceUrl, "https://invoice.stripe.com/i/acct_test/in_adv");
    return true;
  });
});

test("doble clic: un solo cobro, tanto con clics seguidos como simultáneos", async () => {
  const f = await createFixture("doble");
  const { state, deps } = fakeStripe(f.stripeSubscriptionId, { charge: "succeeds" });

  // Simultáneos: los dos leen el mismo periodo → misma clave. El segundo lleva
  // otro `advanceRenewalAt` y Stripe lo rechaza por idempotencia.
  const later: AdvanceRenewalDeps = { ...deps, now: () => new Date(NOW.getTime() + 300) };
  const results = await Promise.allSettled([advanceRenewal(f, deps), advanceRenewal(f, later)]);
  assert.equal(state.updates.length, 1, "Stripe solo aplica un adelanto");
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const rejected = results.find((r) => r.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected" && rejected.reason instanceof AdvanceRenewalError);
  assert.equal(rejected.reason.code, "ALREADY_ADVANCED");

  // Seguido, con la página sin recargar: el periodo ya es otro y la clave
  // también; lo que lo para es la marca del adelanto en la metadata.
  await assertCode(advanceRenewal(f, deps), "ALREADY_ADVANCED");
  assert.equal(state.updates.length, 1);
});

test("SEPA: rechazado antes de tocar Stripe (D5)", async () => {
  const f = await createFixture("sepa");
  const { state, deps } = fakeStripe(f.stripeSubscriptionId, { pmType: "sepa_debit" });
  await assertCode(advanceRenewal(f, deps), "NOT_CARD");
  await assertCode(previewAdvanceRenewal(f, deps), "NOT_CARD");
  assert.equal(state.updates.length, 0);
});

test("cuota con baja programada: rechazada", async () => {
  const f = await createFixture("baja", { cancelAt: new Date(NOW.getTime() + 10 * DAY * 1000) });
  const { state, deps } = fakeStripe(f.stripeSubscriptionId);
  await assertCode(advanceRenewal(f, deps), "CANCELLATION_SCHEDULED");
  assert.equal(state.updates.length, 0);
});

test("cuota cancelada en Stripe aunque la copia local siga viva: rechazada", async () => {
  const f = await createFixture("baja-remota");
  const { state, deps } = fakeStripe(f.stripeSubscriptionId);
  state.sub.cancel_at_period_end = true;
  await assertCode(advanceRenewal(f, deps), "CANCELLATION_SCHEDULED");
  assert.equal(state.updates.length, 0);
});

test("cuota ya cancelada localmente: rechazada", async () => {
  const f = await createFixture("cancelada");
  await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { status: "CANCELLED" } });
  const { state, deps } = fakeStripe(f.stripeSubscriptionId);
  await assertCode(advanceRenewal(f, deps), "NOT_ACTIVE");
  assert.equal(state.updates.length, 0);
});

test("socio de otra organización: NOT_FOUND, sin revelar que la cuota existe", async () => {
  const f = await createFixture("propia");
  const other = await createFixture("ajena");
  const { state, deps } = fakeStripe(f.stripeSubscriptionId);
  // Socio y org ajenos apuntando a la suscripción de otro.
  await assertCode(
    advanceRenewal({ orgId: other.orgId, memberId: other.memberId, subscriptionId: f.subscriptionId }, deps),
    "NOT_FOUND"
  );
  // Org propia pero socio de otra org.
  await assertCode(advanceRenewal({ ...f, memberId: other.memberId }, deps), "NOT_FOUND");
  assert.equal(state.updates.length, 0);
});

test("bono puntual: no hay ciclo que adelantar", async () => {
  const f = await createFixture("bono", { planType: "SESSION_PACK" });
  const { deps } = fakeStripe(f.stripeSubscriptionId);
  await assertCode(advanceRenewal(f, deps), "NOT_RECURRING");
});
