import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcileConnectCheckoutCompleted } from "@/lib/stripe-checkout";

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
 * Hace fallar de verdad la creación del bono de un socio, a nivel de base de
 * datos: es el "algo falla entre medias" del hallazgo sin meter ganchos de
 * prueba en el código de producción.
 */
async function breakBonoCreation(memberId: string) {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION chk_test_fail_subscription() RETURNS trigger AS $$
    BEGIN
      IF NEW."memberId" = '${memberId}' THEN RAISE EXCEPTION 'fallo simulado al crear el bono'; END IF;
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

  await breakBonoCreation(f.memberId);
  try {
    await assert.rejects(reconcileConnectCheckoutCompleted(f.orgId, session));
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
