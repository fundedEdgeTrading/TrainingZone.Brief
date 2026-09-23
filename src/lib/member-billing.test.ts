import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  createMemberCheckout,
  reconcileMemberInvoicePaid,
  reconcileMemberInvoicePaymentFailed,
  reconcileMemberSubscriptionDeleted,
  reconcileMemberSubscriptionUpserted,
} from "@/lib/member-billing";

/**
 * Los cuatro reconciliadores de webhook de Stripe Billing nunca se habían
 * ejecutado. El riesgo que cubren estos tests no es que Stripe falle, sino que
 * Stripe haga lo que hace siempre: **entregar el mismo evento más de una vez**
 * y reintentar una factura impagada hasta cobrarla. Ambas cosas escriben dinero
 * en la base de datos, y ninguna se puede ensayar contra la API real sin una
 * cuenta conectada.
 *
 * Se prueban las funciones directamente y no el endpoint HTTP a propósito: el
 * handler exige `STRIPE_SECRET_KEY`, y el CI la deja sin definir para que
 * `planes-gateo.spec.ts` verifique el modo demo. La verificación de firma y el
 * enrutado por `event.account` ya los cubre `e2e/alta-comercial.spec.ts`.
 *
 * Cada test monta su propia organización y la borra al terminar, así que no
 * depende de los datos de demo ni los ensucia.
 */

const SUFFIX = "e2e-billing-test";

type Fixture = {
  orgId: string;
  planId: string;
  memberId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
};

/** Organización mínima con un socio y una suscripción ligada a Stripe. */
async function createFixture(tag: string): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Billing ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Cuota ${tag}`, type: "MONTHLY", priceCents: 4900 },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Billing ${tag}`,
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
      stripeSubscriptionId,
    },
  });
  return { orgId: org.id, planId: plan.id, memberId: member.id, subscriptionId: subscription.id, stripeSubscriptionId };
}

/**
 * Factura mínima con lo único que leen los reconciliadores. El `subscription`
 * suelto (y no `parent.subscription_details`) es la forma antigua del payload,
 * que `resolveInvoiceSubscriptionId` sigue aceptando y que es la que entregan
 * las cuentas creadas antes de la migración de la API.
 */
function invoice(id: string, stripeSubscriptionId: string, cents: number): Stripe.Invoice {
  return {
    id,
    subscription: stripeSubscriptionId,
    amount_paid: cents,
    amount_due: cents,
    lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86_400 } }] },
  } as unknown as Stripe.Invoice;
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

test("invoice.paid entregado dos veces cobra una sola vez", async () => {
  const f = await createFixture("repetido");
  const inv = invoice(`in_${SUFFIX}-repetido`, f.stripeSubscriptionId, 4900);

  await reconcileMemberInvoicePaid(f.orgId, inv);
  await reconcileMemberInvoicePaid(f.orgId, inv);

  const payments = await prisma.payment.findMany({ where: { orgId: f.orgId } });
  assert.equal(payments.length, 1, "una reentrega del mismo evento no puede duplicar el cobro");
  assert.equal(payments[0].amountCents, 4900);
  assert.equal(payments[0].status, "PAID");

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "ACTIVE");
});

test("los reintentos de dunning no acumulan filas de cobro fallido", async () => {
  const f = await createFixture("dunning");
  const inv = invoice(`in_${SUFFIX}-dunning`, f.stripeSubscriptionId, 4900);

  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);

  const payments = await prisma.payment.findMany({ where: { orgId: f.orgId } });
  assert.equal(payments.length, 1, "Stripe reintenta varias veces la misma factura en un ciclo");
  assert.equal(payments[0].status, "FAILED");

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "DELINQUENT");
});

test("una factura impagada que Stripe acaba cobrando deja al socio al corriente", async () => {
  const f = await createFixture("recuperado");
  // Mismo `invoice.id` en las dos entregas: es como funciona el dunning de
  // Stripe — no emite una factura nueva, reintenta la misma hasta cobrarla.
  const inv = invoice(`in_${SUFFIX}-recuperado`, f.stripeSubscriptionId, 4900);

  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  await reconcileMemberInvoicePaid(f.orgId, inv);

  const payments = await prisma.payment.findMany({ where: { orgId: f.orgId } });
  assert.equal(payments.length, 1, "sigue siendo una sola factura");
  assert.equal(payments[0].status, "PAID", "el cobro que acaba entrando no puede quedarse en FAILED");

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.equal(member.state, "ACTIVE", "cobrado el recibo, el socio deja de ser moroso");

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "ACTIVE");

  const pendientes = await prisma.notification.count({
    where: { orgId: f.orgId, entityId: f.memberId, kind: "ALERT", resolvedAt: null },
  });
  assert.equal(pendientes, 0, "cobrado el recibo, nadie debe seguir persiguiendo a este socio");
});

test("un ciclo de reintentos avisa al socio una sola vez", async () => {
  const f = await createFixture("aviso");
  const inv = invoice(`in_${SUFFIX}-aviso`, f.stripeSubscriptionId, 4900);

  // Tres entregas del mismo `invoice.payment_failed`: es lo que hace el dunning
  // de Stripe a lo largo de un ciclo. Tres emails al socio por un solo recibo
  // fallido es la forma más rápida de que marque el remitente como spam.
  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);
  await reconcileMemberInvoicePaymentFailed(f.orgId, inv);

  const avisos = await prisma.auditLog.count({
    where: { orgId: f.orgId, entityType: "DunningNotice", entityId: inv.id! },
  });
  assert.equal(avisos, 1, "un aviso por factura, no por reintento");
});

test("cada factura impagada tiene su propio aviso", async () => {
  const f = await createFixture("dos-facturas");

  // Dos ciclos distintos (dos meses): el socio sí debe enterarse de los dos.
  await reconcileMemberInvoicePaymentFailed(f.orgId, invoice(`in_${SUFFIX}-mes1`, f.stripeSubscriptionId, 4900));
  await reconcileMemberInvoicePaymentFailed(f.orgId, invoice(`in_${SUFFIX}-mes2`, f.stripeSubscriptionId, 4900));

  const avisos = await prisma.auditLog.count({ where: { orgId: f.orgId, entityType: "DunningNotice" } });
  assert.equal(avisos, 2);
});

test("un evento de otra organización no toca la suscripción", async () => {
  const propia = await createFixture("propia");
  const ajena = await createFixture("ajena");

  // El `orgId` viene de resolver `event.account`; la factura, del payload. Si
  // no coincidieran (cuenta mal mapeada, evento de test reenviado a la cuenta
  // equivocada) el cobro caería sobre el socio de otro gimnasio.
  await reconcileMemberInvoicePaid(ajena.orgId, invoice(`in_${SUFFIX}-cruzado`, propia.stripeSubscriptionId, 4900));

  assert.equal(await prisma.payment.count({ where: { orgId: propia.orgId } }), 0);
  assert.equal(await prisma.payment.count({ where: { orgId: ajena.orgId } }), 0);
});

test("customer.subscription.deleted cancela la suscripción del socio", async () => {
  const f = await createFixture("cancelada");

  await reconcileMemberSubscriptionDeleted(f.orgId, { id: f.stripeSubscriptionId } as Stripe.Subscription);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "CANCELLED");
});

test("STR-02 · con una cuota recurrente viva, «Renovar» no abre un segundo cobro mensual", async () => {
  const f = await createFixture("doble-cuota");

  for (const status of ["ACTIVE", "PENDING_CONFIRMATION", "PAUSED"] as const) {
    await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { status } });
    const result = await createMemberCheckout({ orgId: f.orgId, memberId: f.memberId, planId: f.planId, origin: "portal" });
    assert.equal(result.ok, false, `con la cuota en ${status}`);
    assert.equal(!result.ok && result.code, "ALREADY_SUBSCRIBED");
  }
});

test("STR-02 · una cuota cancelada o un bono puntual no bloquean la compra", async () => {
  const f = await createFixture("sin-bloqueo");

  await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { status: "CANCELLED" } });
  const renovar = await createMemberCheckout({ orgId: f.orgId, memberId: f.memberId, planId: f.planId, origin: "staff" });
  assert.equal(renovar.ok, true, "tras la baja, volver a darse de alta es legítimo");

  // Con la cuota viva, un bono de sesiones sueltas sigue siendo una compra aparte.
  await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { status: "ACTIVE" } });
  const bono = await prisma.membershipPlan.create({
    data: { orgId: f.orgId, name: "Bono 5", type: "SESSION_PACK", priceCents: 5000, sessionsIncluded: 5 },
  });
  const extra = await createMemberCheckout({ orgId: f.orgId, memberId: f.memberId, planId: bono.id, origin: "portal" });
  assert.equal(extra.ok, true);
});

/** `customer.subscription.created/updated` mínimo, con lo que leen los reconciliadores. */
function stripeSubscription(id: string, metadata: Record<string, string>, extra: Record<string, unknown> = {}): Stripe.Subscription {
  const now = Math.floor(Date.now() / 1000);
  return {
    id,
    status: "active",
    metadata,
    pause_collection: null,
    cancel_at: null,
    cancel_at_period_end: false,
    items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86_400 }] },
    ...extra,
  } as unknown as Stripe.Subscription;
}

test("STR-03 · la cuota recurrente queda en el centro donde se vendió, no en el habitual", async () => {
  const f = await createFixture("centro-venta");
  const centroB = await prisma.center.create({
    data: { orgId: f.orgId, name: "Centro B", slug: `${SUFFIX}-centro-venta-b` },
  });
  const id = `sub_${SUFFIX}-centro-venta-nueva`;

  await reconcileMemberSubscriptionUpserted(
    f.orgId,
    stripeSubscription(id, { orgId: f.orgId, memberId: f.memberId, planId: f.planId, centerId: centroB.id })
  );

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: id } });
  assert.equal(sub.centerId, centroB.id);
});

test("STR-03 · un centerId de otra organización en el metadata cae al centro habitual", async () => {
  const f = await createFixture("centro-ajeno");
  const ajena = await createFixture("centro-ajeno-otra");
  const centroAjeno = await prisma.subscription.findUniqueOrThrow({ where: { id: ajena.subscriptionId } });
  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  const id = `sub_${SUFFIX}-centro-ajeno-nueva`;

  await reconcileMemberSubscriptionUpserted(
    f.orgId,
    stripeSubscription(id, { orgId: f.orgId, memberId: f.memberId, planId: f.planId, centerId: centroAjeno.centerId })
  );

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: id } });
  assert.equal(sub.centerId, member.primaryCenterId);
});

test("STR-04 · una cuota congelada con pause_collection sigue PAUSED aunque Stripe diga active", async () => {
  const f = await createFixture("pausa");
  const meta = { orgId: f.orgId, memberId: f.memberId, planId: f.planId };

  await reconcileMemberSubscriptionUpserted(
    f.orgId,
    stripeSubscription(f.stripeSubscriptionId, meta, { pause_collection: { behavior: "void", resumes_at: null } })
  );
  let sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "PAUSED", "Stripe mantiene status=active durante la pausa");

  // Al reanudar, Stripe quita `pause_collection`: vuelve a ACTIVE.
  await reconcileMemberSubscriptionUpserted(f.orgId, stripeSubscription(f.stripeSubscriptionId, meta));
  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "ACTIVE");
});

test("STR-05 · la baja a fin de periodo pedida en el Billing Portal llega a cancelAt, y se retira si se deshace", async () => {
  const f = await createFixture("baja-portal");
  const meta = { orgId: f.orgId, memberId: f.memberId, planId: f.planId };
  const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
  const items = { data: [{ current_period_start: periodEnd - 30 * 86_400, current_period_end: periodEnd }] };

  await reconcileMemberSubscriptionUpserted(
    f.orgId,
    stripeSubscription(f.stripeSubscriptionId, meta, { cancel_at_period_end: true, items })
  );
  let sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.cancelAt?.getTime(), periodEnd * 1000);

  await reconcileMemberSubscriptionUpserted(f.orgId, stripeSubscription(f.stripeSubscriptionId, meta, { items }));
  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.cancelAt, null, "el socio se arrepintió en el Billing Portal");

  const cancelAt = periodEnd - 5 * 86_400;
  await reconcileMemberSubscriptionUpserted(f.orgId, stripeSubscription(f.stripeSubscriptionId, meta, { cancel_at: cancelAt, items }));
  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.cancelAt?.getTime(), cancelAt * 1000);
});

test("STR-05 · una baja programada en recepción (solo local) no la borra un updated sin baja", async () => {
  const f = await createFixture("baja-recepcion");
  const meta = { orgId: f.orgId, memberId: f.memberId, planId: f.planId };
  const local = new Date(Date.now() + 90 * 86_400_000);
  await prisma.subscription.update({ where: { id: f.subscriptionId }, data: { cancelAt: local } });

  await reconcileMemberSubscriptionUpserted(f.orgId, stripeSubscription(f.stripeSubscriptionId, meta));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.cancelAt?.getTime(), local.getTime());
});

test("STR-05 · pause_collection con fecha de vuelta llega a pauseUntil y se limpia al reanudar", async () => {
  const f = await createFixture("pausa-fecha");
  const meta = { orgId: f.orgId, memberId: f.memberId, planId: f.planId };
  const resumesAt = Math.floor(Date.now() / 1000) + 20 * 86_400;

  await reconcileMemberSubscriptionUpserted(
    f.orgId,
    stripeSubscription(f.stripeSubscriptionId, meta, { pause_collection: { behavior: "void", resumes_at: resumesAt } })
  );
  let sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.status, "PAUSED");
  assert.equal(sub.pauseUntil?.getTime(), resumesAt * 1000);

  await reconcileMemberSubscriptionUpserted(f.orgId, stripeSubscription(f.stripeSubscriptionId, meta));
  sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });
  assert.equal(sub.pauseUntil, null);
});
