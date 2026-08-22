import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  reconcileMemberInvoicePaid,
  reconcileMemberInvoicePaymentFailed,
  reconcileMemberSubscriptionDeleted,
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
  return { orgId: org.id, memberId: member.id, subscriptionId: subscription.id, stripeSubscriptionId };
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
