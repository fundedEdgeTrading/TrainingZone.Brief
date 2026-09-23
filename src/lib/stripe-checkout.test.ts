import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { reconcileConnectCheckoutCompleted } from "@/lib/stripe-checkout";
import { POST } from "@/app/api/stripe/webhook/route";

// Igual que `stripe-webhook-dispatch.test.ts`: la ruta lee las dos variables en
// cada petición, así que basta con fijarlas antes de la primera entrega.
process.env.STRIPE_SECRET_KEY ||= "sk_test_chk_checkout";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET ||= "whsec_chk_checkout";

/**
 * Conciliación de `checkout.session.completed` en la cuenta conectada (pista
 * stripe-checkout, hallazgos CHK-*).
 *
 * Las sesiones de Stripe son DOBLES: objetos con la forma que manda el webhook,
 * sin red ni clave. Lo que se prueba es lo que queda escrito en la base, que es
 * donde se ve el riesgo (socio cobrado y sin bono, alta pagada perdida), así que
 * cada test monta su propia organización contra la base real y la borra al
 * terminar, igual que `stripe-mandate.test.ts`.
 */

const SUFFIX = "e2e-chk-test";
const EVENT_PREFIX = `evt_${SUFFIX}`;

type Fixture = { orgId: string; centerId: string; planId: string; memberId: string; paymentId: string; sessionId: string };

async function createFixture(tag: string, opts: { paymentStatus?: "PENDING" | "PAID" } = {}): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `CHK ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Bono 8 ${tag}`, type: "SESSION_PACK", priceCents: 8000, sessionsIncluded: 8 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Socio", lastName: tag, email: `${slug}@example.com` },
  });
  const sessionId = `cs_${slug}`;
  const payment = await prisma.payment.create({
    data: {
      orgId: org.id,
      memberId: member.id,
      amountCents: 8000,
      method: "STRIPE",
      status: opts.paymentStatus ?? "PENDING",
      date: new Date(),
      stripeCheckoutSessionId: sessionId,
    },
  });
  return { orgId: org.id, centerId: center.id, planId: plan.id, memberId: member.id, paymentId: payment.id, sessionId };
}

/** Doble de la sesión de un socio existente comprando un bono puntual con tarjeta. */
function paidMemberSession(f: Fixture): Stripe.Checkout.Session {
  return {
    id: f.sessionId,
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    payment_intent: `pi_${f.sessionId}`,
    amount_total: 8000,
    metadata: { orgId: f.orgId, memberId: f.memberId, planId: f.planId, centerId: f.centerId },
  } as unknown as Stripe.Checkout.Session;
}

/**
 * Hace fallar de verdad la creación de un bono (el de ese socio, o el de ese
 * plan), a nivel de base de datos: es el "algo falla entre medias" de los
 * hallazgos sin meter ganchos de prueba en el código de producción.
 */
async function breakBonoCreation(column: "memberId" | "planId", value: string) {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION chk_test_fail_subscription() RETURNS trigger AS $$
    BEGIN
      IF NEW."${column}" = '${value}' THEN RAISE EXCEPTION 'fallo simulado al crear el bono'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql;
  `);
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS chk_test_fail_subscription ON "Subscription"`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER chk_test_fail_subscription BEFORE INSERT ON "Subscription" FOR EACH ROW EXECUTE FUNCTION chk_test_fail_subscription()`
  );
}

async function restoreBonoCreation() {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS chk_test_fail_subscription ON "Subscription"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS chk_test_fail_subscription()`);
}

async function cleanup() {
  await restoreBonoCreation();
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: EVENT_PREFIX } } });
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.notification.deleteMany({ where: { orgId: org.id } });
    await prisma.sessionLedger.deleteMany({ where: { orgId: org.id } });
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.invitation.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.stripeAccount.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// CHK-01 · Payment PAID + bono + SessionLedger, todo o nada
// ---------------------------------------------------------------------------

test("CHK-01: si crear el bono falla, el Payment NO queda PAID y la reentrega crea el bono", async () => {
  const f = await createFixture("atomico");
  const session = paidMemberSession(f);

  await breakBonoCreation("memberId", f.memberId);
  try {
    const fallo = await reconcileConnectCheckoutCompleted(f.orgId, session);
    assert.equal(fallo.ok, false, "el fallo se propaga para que Stripe reintente");
  } finally {
    await restoreBonoCreation();
  }

  const tras = await prisma.payment.findUniqueOrThrow({ where: { id: f.paymentId } });
  assert.equal(tras.status, "PENDING", "sin bono no hay cobro conciliado: la transacción se deshace entera");

  // Stripe reentrega el mismo evento: esta vez tiene que dejarlo todo hecho.
  await reconcileConnectCheckoutCompleted(f.orgId, session);

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: f.paymentId } });
  assert.equal(payment.status, "PAID");
  assert.ok(payment.subscriptionId, "el Payment apunta a su bono");
  const bono = await prisma.subscription.findUniqueOrThrow({ where: { id: payment.subscriptionId! } });
  assert.equal(bono.sessionsRemaining, 8);
  const asientos = await prisma.sessionLedger.findMany({ where: { subscriptionId: bono.id } });
  assert.deepEqual(
    asientos.map((a) => [a.reason, a.delta]),
    [["PURCHASE", 8]],
    "el alta del bono deja su asiento en el libro mayor"
  );
});

test("CHK-01: la guarda de reentrega exige el bono, no solo el Payment PAID", async () => {
  // Es el estado exacto en que dejaba las cosas el fallo: cobrado y sin bono.
  const f = await createFixture("reparar", { paymentStatus: "PAID" });

  await reconcileConnectCheckoutCompleted(f.orgId, paidMemberSession(f));

  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: f.paymentId } });
  assert.ok(payment.subscriptionId, "la reentrega repara el bono que faltaba");
  assert.equal(await prisma.subscription.count({ where: { memberId: f.memberId } }), 1);
});

test("CHK-01: una reentrega normal no duplica el bono", async () => {
  const f = await createFixture("reentrega");
  const session = paidMemberSession(f);

  await reconcileConnectCheckoutCompleted(f.orgId, session);
  await reconcileConnectCheckoutCompleted(f.orgId, session);

  assert.equal(await prisma.subscription.count({ where: { memberId: f.memberId } }), 1);
  assert.equal(await prisma.sessionLedger.count({ where: { orgId: f.orgId } }), 1);
});

// ---------------------------------------------------------------------------
// CHK-02 · Un alta pagada desde la landing no se pierde (RB-PAGO-002)
// ---------------------------------------------------------------------------

type LandingFixture = { orgId: string; centerId: string; planId: string; email: string; accountId: string };

async function createLandingFixture(tag: string, planType: "SESSION_PACK" | "MONTHLY" = "SESSION_PACK"): Promise<LandingFixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `CHK ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Plan ${tag}`, type: planType, priceCents: 4900, sessionsIncluded: 8 },
  });
  const accountId = `acct_${slug}`;
  await prisma.stripeAccount.create({ data: { orgId: org.id, accountId, chargesEnabled: true, payoutsEnabled: true } });
  return { orgId: org.id, centerId: center.id, planId: plan.id, email: `${slug}@example.com`, accountId };
}

/** Doble de la sesión que crea `createProspectMemberCheckout` en `/hazte-socio`. */
function landingSession(
  f: LandingFixture,
  tag: string,
  overrides: Partial<Record<"mode" | "payment_status" | "customer" | "subscription", string>> = {}
): Stripe.Checkout.Session {
  return {
    id: `cs_${SUFFIX}-${tag}`,
    status: "complete",
    payment_status: overrides.payment_status ?? "paid",
    mode: overrides.mode ?? "payment",
    payment_intent: overrides.mode === "subscription" ? null : `pi_${SUFFIX}-${tag}`,
    subscription: overrides.subscription ?? null,
    customer: overrides.customer ?? null,
    amount_total: 4900,
    metadata: {
      orgId: f.orgId,
      centerId: f.centerId,
      planId: f.planId,
      prospectFirstName: "Lucía",
      prospectLastName: "Landing",
      prospectEmail: f.email,
      prospectPhone: "",
    },
  } as unknown as Stripe.Checkout.Session;
}

/** Entrega firmada con el HMAC real, como la haría Stripe a la cuenta conectada. */
async function deliver(eventId: string, accountId: string, session: Stripe.Checkout.Session) {
  const payload = JSON.stringify({ id: eventId, type: "checkout.session.completed", account: accountId, data: { object: session } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET! });
  const req = new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": signature, "content-type": "application/json" },
  });
  return (await POST(req)).status;
}

test("CHK-02: un plan que no existe devuelve ok:false en vez de callarse", async () => {
  const f = await createLandingFixture("sin-plan");
  const session = landingSession(f, "sin-plan");
  session.metadata!.planId = "plan-que-no-existe";

  const result = await reconcileConnectCheckoutCompleted(f.orgId, session);
  assert.equal(result?.ok, false);
});

test("CHK-02: el alta que falla a medias se reintenta y la reentrega la completa", async () => {
  const f = await createLandingFixture("reintento");
  const session = landingSession(f, "reintento");

  await breakBonoCreation("planId", f.planId);
  try {
    const fallo = await reconcileConnectCheckoutCompleted(f.orgId, session);
    assert.equal(fallo?.ok, false, "el error ya no se traga: Stripe tiene que reintentar");
  } finally {
    await restoreBonoCreation();
  }

  const result = await reconcileConnectCheckoutCompleted(f.orgId, session);
  assert.equal(result.ok, true);

  const member = await prisma.member.findFirstOrThrow({ where: { orgId: f.orgId, email: f.email } });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeCheckoutSessionId: session.id } });
  assert.equal(payment.memberId, member.id);
  assert.equal(payment.status, "PAID");
  assert.ok(payment.subscriptionId, "la reentrega termina el alta: el socio tiene su bono");
  assert.equal(await prisma.member.count({ where: { orgId: f.orgId } }), 1, "sin ficha duplicada");
});

test("CHK-02: la ruta del webhook responde 500 si el alta desde la landing falla", async () => {
  const f = await createLandingFixture("ruta");
  const session = landingSession(f, "ruta");
  session.metadata!.centerId = "centro-que-no-existe";

  const status = await deliver(`${EVENT_PREFIX}-ruta`, f.accountId, session);
  assert.equal(status, 500, "con 200 Stripe daría el evento por consumido y el alta pagada se perdería");

  const evento = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: `${EVENT_PREFIX}-ruta` } });
  assert.equal(evento.processedAt, null, "el evento no queda sellado como procesado");
  assert.ok(evento.lastError, "y queda anotado por qué");
});
