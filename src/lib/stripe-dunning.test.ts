import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcileMemberInvoicePaid, reconcileMemberInvoicePaymentFailed } from "@/lib/member-billing";
import { bookingGateForMember, getMemberDunningStatus, openDelinquency, retriesExhausted } from "@/lib/stripe-dunning";
import { bookSessionForMember } from "@/lib/portal-queries";

/**
 * HU-ST-18 · Dunning con corte de acceso explícito.
 *
 * El agujero de la historia, verificado en el código: `Member.state =
 * DELINQUENT` **no cortaba nada**, porque el motor de reservas filtra por
 * `Subscription.status === "ACTIVE"`. El moroso seguía reservando mientras su
 * bono estuviera vivo, así que el impago no tenía ninguna consecuencia.
 *
 * Lo que se prueba aquí es el corte de verdad: que durante el periodo de gracia
 * TODAVÍA puede reservar, que al agotarse no, que el plazo es el de SU
 * organización y que al entrar el cobro vuelve todo solo.
 */

const SUFFIX = "e2e-dunning-test";

type Fixture = {
  orgId: string;
  memberId: string;
  centerId: string;
  planId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
  sessionId: string;
};

async function createFixture(tag: string, graceDays = 7): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({
    data: { name: `Dunning ${tag}`, slug, dunningGraceDays: graceDays },
  });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const plan = await prisma.membershipPlan.create({
    // Con sesiones incluidas a propósito: el invariante que hay que poder
    // comprobar es que cortar por morosidad NO mueve `sessionsRemaining`, y un
    // bono ilimitado no distinguiría "no se movió" de "no había nada que mover".
    data: { orgId: org.id, name: `Cuota ${tag}`, type: "MONTHLY", priceCents: 4900, sessionsIncluded: 8 },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Dunning ${tag}`,
      email: `${slug}@example.com`,
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
      sessionsIncluded: 8,
      sessionsRemaining: 8,
      stripeSubscriptionId,
    },
  });

  // Una clase de grupo mañana, dentro de la ventana de reserva del portal.
  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  manana.setHours(0, 0, 0, 0);
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: `Clase ${tag}`,
      classType: "Grupos reducidos",
      date: manana,
      startTime: "18:00",
      endTime: "19:00",
      capacity: 10,
      status: "SCHEDULED",
    },
  });

  return {
    orgId: org.id,
    memberId: member.id,
    centerId: center.id,
    planId: plan.id,
    subscriptionId: subscription.id,
    stripeSubscriptionId,
    sessionId: session.id,
  };
}

/** El socio tal y como lo pasa el portal al motor de reservas. */
async function memberForBooking(f: Fixture) {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: f.memberId },
    include: { subscriptions: { where: { status: "ACTIVE" }, include: { plan: true } } },
  });
  return {
    id: member.id,
    primaryCenterId: member.primaryCenterId,
    subscriptions: member.subscriptions.map((s) => ({
      id: s.id,
      status: s.status as string,
      centerId: s.centerId,
      sessionsRemaining: s.sessionsRemaining,
      plan: { type: s.plan.type as string },
    })),
  };
}

function invoice(id: string, stripeSubscriptionId: string, cents: number, nextAttempt: number | null): Stripe.Invoice {
  return {
    id,
    subscription: stripeSubscriptionId,
    amount_paid: cents,
    amount_due: cents,
    collection_method: "charge_automatically",
    next_payment_attempt: nextAttempt,
    lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86_400 } }] },
  } as unknown as Stripe.Invoice;
}

/** Retrasa el inicio del impago para simular que la gracia ya ha pasado. */
async function backdateDelinquency(memberId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  await prisma.member.update({ where: { id: memberId }, data: { delinquentSince: since } });
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.notification.deleteMany({ where: { orgId: org.id } });
    await prisma.sessionLedger.deleteMany({ where: { orgId: org.id } });
    await prisma.booking.deleteMany({ where: { session: { orgId: org.id } } });
    await prisma.classSession.deleteMany({ where: { orgId: org.id } });
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    // M4/E14-16: la baja por reintentos agotados pasa por `member-lifecycle.ts`,
    // que deja escrito el motivo de baja del sistema en el catálogo de la
    // organización. Va después de los socios, que son quienes lo referencian.
    await prisma.cancelReason.deleteMany({ where: { orgId: org.id } });
    await prisma.freezeReason.deleteMany({ where: { orgId: org.id } });
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

test("agotados los reintentos se reconoce por el payload, no por adivinar", () => {
  assert.equal(retriesExhausted({ collection_method: "charge_automatically", next_payment_attempt: null }), true);
  assert.equal(
    retriesExhausted({ collection_method: "charge_automatically", next_payment_attempt: 1790000000 }),
    false
  );
  // Una factura que se paga a mano tampoco tiene "siguiente intento", y no ha
  // agotado nada: darla por agotada da de baja a un socio al primer aviso.
  assert.equal(retriesExhausted({ collection_method: "send_invoice", next_payment_attempt: null }), false);
  assert.equal(retriesExhausted({}), false, "sin el dato no se cancela a nadie");
});

// ---------------------------------------------------------------------------
// El escenario principal
// ---------------------------------------------------------------------------

test("el moroso reserva durante la gracia y deja de poder al agotarse", async () => {
  const f = await createFixture("corte");

  // Primer impago: moroso, avisado… y con acceso.
  await reconcileMemberInvoicePaymentFailed(
    f.orgId,
    invoice(`in_${SUFFIX}-corte`, f.stripeSubscriptionId, 4900, Math.floor(Date.now() / 1000) + 3 * 86_400)
  );

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "DELINQUENT");
  assert.notEqual(member.delinquentSince, null);

  let gate = await bookingGateForMember(f.memberId, { surface: "member" });
  assert.equal(gate.allowed, true, "durante la gracia TODAVÍA puede reservar");

  const dentro = await bookSessionForMember(await memberForBooking(f), f.sessionId);
  assert.equal(dentro.ok, true, "el corte no puede adelantarse al final de la gracia");

  // Se agota la gracia: 8 días con el plazo por defecto de 7 (D-S5).
  await backdateDelinquency(f.memberId, 8);

  gate = await bookingGateForMember(f.memberId, { surface: "member" });
  assert.equal(gate.allowed, false, "pasada la gracia, se corta la reserva de nuevas sesiones");
  assert.match(
    gate.allowed === false ? gate.reason : "",
    /no puedes reservar/i,
    "y se le explica el motivo, no un error mudo"
  );

  // Y el corte llega al motor, que es lo que fallaba: filtraba por el estado
  // del BONO, no por el del socio.
  const fuera = await bookSessionForMember(await memberForBooking(f), f.sessionId);
  assert.equal(fuera.ok, false);

  // El bono sigue intacto: cortar por morosidad no consume ni devuelve saldo.
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "ACTIVE", "el bono no se toca: el corte es del socio, no del bono");
  assert.equal(sub.sessionsRemaining, 7, "solo se descontó la reserva que sí entró; el corte no mueve saldo");
  const asientos = await prisma.sessionLedger.count({ where: { subscriptionId: f.subscriptionId } });
  assert.equal(asientos, 1, "un asiento por movimiento de saldo, y el corte no es un movimiento");
});

test("el periodo de gracia es el de la organización, no una constante del producto", async () => {
  const laxa = await createFixture("gracia-larga", 30);
  const estricta = await createFixture("gracia-cero", 0);

  await openDelinquency({ orgId: laxa.orgId, memberId: laxa.memberId, amountCents: 4900, reason: "INVOICE_FAILED" });
  await openDelinquency({
    orgId: estricta.orgId,
    memberId: estricta.memberId,
    amountCents: 4900,
    reason: "INVOICE_FAILED",
  });
  await backdateDelinquency(laxa.memberId, 10);
  await backdateDelinquency(estricta.memberId, 0);

  const conGracia = await getMemberDunningStatus(laxa.memberId);
  assert.equal(conGracia?.graceDays, 30);
  assert.equal(conGracia?.blocked, false, "a los 10 días, con 30 configurados, sigue entrando");

  const sinGracia = await getMemberDunningStatus(estricta.memberId);
  assert.equal(sinGracia?.graceDays, 0);
  assert.equal(sinGracia?.blocked, true, "con 0 días configurados el corte es inmediato");
});

test("el reloj de la gracia arranca en el primer impago y no lo reinicia cada reintento", async () => {
  const f = await createFixture("reloj");
  const inv = invoice(`in_${SUFFIX}-reloj`, f.stripeSubscriptionId, 4900, Math.floor(Date.now() / 1000) + 86_400);

  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  await backdateDelinquency(f.memberId, 6);
  const antes = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });

  // Segundo reintento del mismo ciclo: si reiniciara el reloj, el moroso
  // tendría periodo de gracia infinito mientras Stripe siguiera reintentando.
  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  const despues = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });

  assert.deepEqual(despues.delinquentSince, antes.delinquentSince);
});

test("cobrado el recibo, el acceso vuelve sin que nadie haga nada", async () => {
  const f = await createFixture("recuperado");
  // Con otro reintento por delante: el fin de reintentos es otro escenario (da
  // de baja, no deja moroso), y aquí lo que se prueba es la recuperación.
  const inv = invoice(
    `in_${SUFFIX}-recuperado`,
    f.stripeSubscriptionId,
    4900,
    Math.floor(Date.now() / 1000) + 3 * 86_400
  );

  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  await backdateDelinquency(f.memberId, 20);
  assert.equal((await bookingGateForMember(f.memberId)).allowed, false);

  // Stripe reintenta la MISMA factura y esta vez entra.
  await reconcileMemberInvoicePaid(f.orgId, inv);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "ACTIVE");
  assert.equal(member.delinquentSince, null, "sin impago abierto no puede quedar un reloj colgado");
  assert.equal((await bookingGateForMember(f.memberId)).allowed, true);

  const pendientes = await prisma.notification.count({
    where: { orgId: f.orgId, entityId: f.memberId, kind: "ALERT", resolvedAt: null },
  });
  assert.equal(pendientes, 0, "el aviso se resuelve solo");
});

test("agotados los reintentos, la suscripción se cancela y el socio pasa a baja (D-S6)", async () => {
  const f = await createFixture("sin-reintentos");

  await reconcileMemberInvoicePaymentFailed(
    f.orgId,
    invoice(`in_${SUFFIX}-sin-reintentos`, f.stripeSubscriptionId, 4900, null)
  );

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "CANCELLED");

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "CANCELLED");

  const traza = await prisma.auditLog.findMany({
    where: { orgId: f.orgId, entityType: "DunningCancellation", entityId: f.stripeSubscriptionId },
  });
  assert.equal(traza.length, 1, "una baja por impago tiene que quedar registrada, y una sola vez");

  // Un segundo fallo de la misma factura no vuelve a cancelar ni a duplicar la
  // traza: Stripe entrega más de una vez.
  await reconcileMemberInvoicePaymentFailed(
    f.orgId,
    invoice(`in_${SUFFIX}-sin-reintentos`, f.stripeSubscriptionId, 4900, null)
  );
  const traza2 = await prisma.auditLog.count({
    where: { orgId: f.orgId, entityType: "DunningCancellation", entityId: f.stripeSubscriptionId },
  });
  assert.equal(traza2, 1);
});

test("un socio congelado voluntariamente no entra en la lista de morosos", async () => {
  const f = await createFixture("congelado");
  await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { status: "PAUSED" } });

  // Una factura en vuelo justo al congelar: es la única forma de que llegue un
  // fallo de cobro de alguien que pidió la congelación.
  await openDelinquency({ orgId: f.orgId, memberId: f.memberId, amountCents: 4900, reason: "INVOICE_FAILED" });

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.notEqual(member.state, "DELINQUENT", "PAUSED es una pausa pedida por el socio, no un impago");
  assert.equal(member.delinquentSince, null);

  const morosos = await prisma.member.count({ where: { orgId: f.orgId, state: "DELINQUENT" } });
  assert.equal(morosos, 0);
});
