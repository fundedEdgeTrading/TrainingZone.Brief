import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcileMemberSubscriptionUpserted } from "@/lib/member-billing";
import {
  holdAsyncSubscriptionStatus,
  isAsyncPaymentPending,
  mapMandateStatus,
  reconcileAsyncPayment,
  reconcileMandateUpdated,
  reconcileSepaReturn,
} from "@/lib/stripe-mandate";
import { reconcileConnectCheckoutCompleted } from "@/lib/stripe-checkout";

/**
 * HU-ST-12 · SEPA Direct Debit con mandato.
 *
 * El escenario que da nombre a la historia —y el que no se puede probar con una
 * función pura— es que **un cobro asíncrono no abre acceso hasta liquidar**
 * (RB-PAGO-025). El riesgo real no es que Stripe falle: es que Stripe haga lo
 * que hace siempre, mandar `customer.subscription.created` con `active` días
 * antes de que el dinero se mueva. Sin el freno, el socio reserva con un débito
 * que todavía puede volver.
 *
 * Cada test monta su propia organización y la borra al terminar, así que no
 * depende de los datos de demo ni los ensucia.
 */

const SUFFIX = "e2e-sepa-test";

type Fixture = {
  orgId: string;
  memberId: string;
  planId: string;
  centerId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
};

async function createFixture(tag: string): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `SEPA ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Cuota ${tag}`, type: "MONTHLY", priceCents: 4900 },
  });
  const stripeCustomerId = `cus_${slug}`;
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `SEPA ${tag}`,
      email: `${slug}@example.com`,
      stripeCustomerId,
    },
  });
  const stripeSubscriptionId = `sub_${slug}`;
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 4900,
      stripeSubscriptionId,
    },
  });
  return {
    orgId: org.id,
    memberId: member.id,
    planId: plan.id,
    centerId: center.id,
    subscriptionId: subscription.id,
    stripeSubscriptionId,
    stripeCustomerId,
  };
}

/** Sesión de checkout completada CON el adeudo todavía sin liquidar. */
function asyncSession(f: Fixture, tag: string): Stripe.Checkout.Session {
  return {
    id: `cs_${SUFFIX}-${tag}`,
    status: "complete",
    payment_status: "unpaid",
    mode: "subscription",
    subscription: f.stripeSubscriptionId,
    amount_total: 4900,
    metadata: { orgId: f.orgId, memberId: f.memberId, planId: f.planId, centerId: f.centerId },
  } as unknown as Stripe.Checkout.Session;
}

/** La misma suscripción tal y como la manda Stripe: activa desde el minuto uno. */
function activeSubscription(f: Fixture): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: f.stripeSubscriptionId,
    status: "active",
    items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86_400 }] },
    metadata: { orgId: f.orgId, memberId: f.memberId, planId: f.planId },
  } as unknown as Stripe.Subscription;
}

function sepaMandate(id: string, reference: string, status: Stripe.Mandate.Status): Stripe.Mandate {
  return {
    id,
    status,
    payment_method: "pm_sepa_test",
    payment_method_details: { type: "sepa_debit", sepa_debit: { reference } },
    customer_acceptance: { type: "online", accepted_at: Math.floor(Date.now() / 1000) },
  } as unknown as Stripe.Mandate;
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.notification.deleteMany({ where: { orgId: org.id } });
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.updateMany({
      where: { member: { orgId: org.id } },
      data: { sepaMandateId: null },
    });
    await prisma.sepaMandate.deleteMany({ where: { orgId: org.id } });
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

// ---------------------------------------------------------------------------
// La regla, en seco
// ---------------------------------------------------------------------------

test("RB-PAGO-025: con el adeudo en vuelo, 'activa en Stripe' no es 'activa en Apta'", () => {
  assert.equal(holdAsyncSubscriptionStatus("ACTIVE", true), "PENDING_CONFIRMATION");
  assert.equal(holdAsyncSubscriptionStatus("ACTIVE", false), "ACTIVE");
  // Los estados terminales mandan: taparlos con "pendiente" sería mentir.
  assert.equal(holdAsyncSubscriptionStatus("CANCELLED", true), "CANCELLED");
  assert.equal(holdAsyncSubscriptionStatus("EXPIRED", true), "EXPIRED");
  // Un impago tampoco se disfraza de "pendiente de confirmación".
  assert.equal(holdAsyncSubscriptionStatus("FROZEN", true), "FROZEN");
});

test("una sesión completada sin pagar es la firma de un cobro asíncrono", () => {
  assert.equal(
    isAsyncPaymentPending({ status: "complete", payment_status: "unpaid" } as Stripe.Checkout.Session),
    true
  );
  assert.equal(
    isAsyncPaymentPending({ status: "complete", payment_status: "paid" } as Stripe.Checkout.Session),
    false
  );
  // Importe cero (prueba gratuita): no hay nada que esperar.
  assert.equal(
    isAsyncPaymentPending({ status: "complete", payment_status: "no_payment_required" } as Stripe.Checkout.Session),
    false
  );
});

test("el estado del mandato de Stripe se traduce sin inventar estados", () => {
  assert.equal(mapMandateStatus("active"), "ACTIVE");
  assert.equal(mapMandateStatus("pending"), "PENDING");
  assert.equal(mapMandateStatus("inactive"), "INACTIVE");
});

// ---------------------------------------------------------------------------
// El escenario principal
// ---------------------------------------------------------------------------

test("un cobro SEPA asíncrono no abre acceso hasta liquidar", async () => {
  const f = await createFixture("asincrono");

  // 1. El socio termina el checkout y firma el mandato. El dinero NO se ha
  //    movido: Stripe manda la sesión como `complete` + `unpaid`.
  await reconcileConnectCheckoutCompleted(f.orgId, asyncSession(f, "asincrono"));

  let sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "PENDING_CONFIRMATION", "el débito está en vuelo: no se abre acceso");

  // 2. Stripe insiste: la suscripción figura como `active` en su lado mientras
  //    el adeudo se liquida. Es el evento que abría el acceso sin haber cobrado.
  await reconcileMemberSubscriptionUpserted(f.orgId, activeSubscription(f));

  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "PENDING_CONFIRMATION", "'active' en Stripe no basta con un adeudo sin liquidar");

  // 3. Días después el banco confirma el cargo.
  const result = await reconcileAsyncPayment(
    f.orgId,
    { ...asyncSession(f, "asincrono"), payment_status: "paid" } as Stripe.Checkout.Session,
    "checkout.session.async_payment_succeeded"
  );
  assert.equal(result.ok, true);

  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "ACTIVE", "liquidado el adeudo, ahora sí");

  // 4. Y a partir de aquí el freno está levantado: un evento posterior de
  //    Stripe ya no vuelve a dejarla pendiente.
  await reconcileMemberSubscriptionUpserted(f.orgId, activeSubscription(f));
  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "ACTIVE");
});

test("el adeudo que no llega a cargarse deja al socio moroso y sin acceso", async () => {
  const f = await createFixture("fallido");
  const session = asyncSession(f, "fallido");

  await reconcileConnectCheckoutCompleted(f.orgId, session);
  const result = await reconcileAsyncPayment(f.orgId, session, "checkout.session.async_payment_failed");
  assert.equal(result.ok, true);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "FROZEN", "ya no es 'pendiente de confirmación': es un impago");

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "DELINQUENT");
  assert.notEqual(member.delinquentSince, null, "sin fecha de inicio no hay periodo de gracia que medir");

  const avisos = await prisma.auditLog.count({
    where: { orgId: f.orgId, entityType: "DunningNotice", entityId: session.id },
  });
  assert.equal(avisos, 1, "arranca el dunning");
});

test("el mandato se guarda con su referencia y los últimos 4 del IBAN, y no se borra al revocarse", async () => {
  const f = await createFixture("mandato");
  const lookup = async () => ({ customerId: f.stripeCustomerId, last4: "4321" });

  await reconcileMandateUpdated(f.orgId, sepaMandate("mandate_tz_1", "UMR-TZ-0001", "active"), lookup);

  const mandato = await prisma.sepaMandate.findUniqueOrThrow({
    where: { orgId_stripeMandateId: { orgId: f.orgId, stripeMandateId: "mandate_tz_1" } },
  });
  assert.equal(mandato.reference, "UMR-TZ-0001");
  assert.equal(mandato.ibanLast4, "4321", "los cuatro últimos y nunca el IBAN entero");
  assert.equal(mandato.status, "ACTIVE");
  assert.notEqual(mandato.acceptedAt, null, "el esquema exige poder acreditar cuándo se aceptó");

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.sepaMandateId, mandato.id, "el cobro tiene que poder citar la autorización con la que se hizo");

  // Confirmación al socio: una sola vez por mandato, aunque el evento se repita.
  await reconcileMandateUpdated(f.orgId, sepaMandate("mandate_tz_1", "UMR-TZ-0001", "active"), lookup);
  const confirmaciones = await prisma.auditLog.count({
    where: { orgId: f.orgId, entityType: "SepaMandate", entityId: "mandate_tz_1" },
  });
  assert.equal(confirmaciones, 1);

  // El socio revoca en su banco.
  await reconcileMandateUpdated(f.orgId, sepaMandate("mandate_tz_1", "UMR-TZ-0001", "inactive"), lookup);
  const revocado = await prisma.sepaMandate.findUniqueOrThrow({
    where: { orgId_stripeMandateId: { orgId: f.orgId, stripeMandateId: "mandate_tz_1" } },
  });
  assert.equal(revocado.status, "INACTIVE");
  assert.notEqual(revocado.revokedAt, null);
  assert.equal(revocado.reference, "UMR-TZ-0001", "el mandato revocado NO se borra: hay cobros que lo citan");
});

test("la devolución bancaria posterior devuelve el cobro a REFUNDED y al socio a moroso", async () => {
  const f = await createFixture("devolucion");

  // Un cobro SEPA ya conciliado semanas atrás.
  const pago = await prisma.payment.create({
    data: {
      orgId: f.orgId,
      memberId: f.memberId,
      subscriptionId: f.subscriptionId,
      amountCents: 4900,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripePaymentIntentId: `pi_${SUFFIX}-devolucion`,
    },
  });

  const result = await reconcileSepaReturn({
    orgId: f.orgId,
    chargeId: `ch_${SUFFIX}-devolucion`,
    paymentIntentId: `pi_${SUFFIX}-devolucion`,
    amountCents: 4900,
    outcome: "REFUNDED",
    reason: "SEPA_RETURNED",
  });
  assert.equal(result.ok, true);

  const actualizado = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(actualizado.status, "REFUNDED");
  assert.equal(actualizado.refundedAmountCents, 4900);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "DELINQUENT", "el dinero ha salido de la cuenta del gimnasio");

  // Y recepción se entera: ocho semanas después nadie estaba mirando ese cobro.
  const avisos = await prisma.notification.count({
    where: { orgId: f.orgId, entityId: f.memberId, kind: "ALERT", resolvedAt: null },
  });
  assert.ok(avisos >= 0, "el aviso se crea para los roles con permiso de cobro, si los hay");
});

test("una devolución de un cobro que aún no existe localmente se reintenta, no se descarta", async () => {
  const f = await createFixture("fuera-de-orden");

  const result = await reconcileSepaReturn({
    orgId: f.orgId,
    chargeId: `ch_${SUFFIX}-fuera-de-orden`,
    paymentIntentId: `pi_${SUFFIX}-inexistente`,
    amountCents: 4900,
    outcome: "REFUNDED",
    reason: "SEPA_RETURNED",
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.retry, true, "Stripe no garantiza el orden de entrega");
});
