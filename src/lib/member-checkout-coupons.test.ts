import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcileMemberInvoicePaid } from "@/lib/member-billing";
import { reconcileConnectCheckoutCompleted } from "@/lib/stripe-checkout";

/**
 * HU-ST-27, escenario "uso" · el enganche que P5 pidió por escrito
 * (`docs/hu/P5-peticion-member-billing.md`).
 *
 * La lógica del descuento es de P5 y está probada en `stripe-coupons.test.ts`.
 * Lo que se prueba AQUÍ es lo que P5 no podía probar sin tocar ficheros de P1:
 * que las dos creaciones de checkout piden la casilla del código, y que las dos
 * conciliaciones capturan el descuento. Sin esto, el cupón se crea en la cuenta
 * conectada, el socio no tiene dónde teclearlo, y la pantalla de medición sale
 * a cero por mucho que se use.
 */

const SUFFIX = "e2e-cupon-enganche";

type Fixture = {
  orgId: string;
  memberId: string;
  centerId: string;
  planId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
};

async function createFixture(tag: string): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Cupón ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Bono ${tag}`, type: "SESSION_PACK", priceCents: 6000, sessionsIncluded: 4 },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Cupón ${tag}`,
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
      priceCents: 6000,
      stripeSubscriptionId,
    },
  });
  return {
    orgId: org.id,
    memberId: member.id,
    centerId: center.id,
    planId: plan.id,
    subscriptionId: subscription.id,
    stripeSubscriptionId,
  };
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
    await prisma.stripeCoupon.deleteMany({ where: { orgId: org.id } });
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

test("las dos creaciones de checkout de socio piden la casilla del código", () => {
  // Estructural y no de comportamiento: crear una sesión de checkout exige una
  // cuenta conectada real, y lo que hay que proteger es que el parámetro no
  // desaparezca de ninguna de las dos puertas — sin él, Stripe no pinta la
  // casilla y el cupón del gimnasio es inalcanzable.
  const fuente = readFileSync("src/lib/member-billing.ts", "utf8");
  const ocurrencias = fuente.match(/allow_promotion_codes: true/g) ?? [];
  assert.equal(
    ocurrencias.length,
    2,
    "las dos puertas de venta (socio existente y prospecto de la landing) tienen que admitir código"
  );
});

test("un bono con código deja el descuento y el cupón en el Payment", async () => {
  const f = await createFixture("bono");
  const sessionId = `cs_${SUFFIX}-bono`;

  await prisma.payment.create({
    data: {
      orgId: f.orgId,
      memberId: f.memberId,
      amountCents: 6000, // precio de catálogo: el descuento todavía no se sabe
      method: "STRIPE",
      status: "PENDING",
      date: new Date(),
      stripeCheckoutSessionId: sessionId,
    },
  });

  const session = {
    id: sessionId,
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    amount_total: 4500,
    total_details: { amount_discount: 1500 },
    discounts: [{ coupon: { id: "co_verano25", name: "Verano 25", percent_off: 25 } }],
    metadata: { orgId: f.orgId, memberId: f.memberId, planId: f.planId, centerId: f.centerId },
  } as unknown as Stripe.Checkout.Session;

  await reconcileConnectCheckoutCompleted(f.orgId, session);

  const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeCheckoutSessionId: sessionId } });
  assert.equal(payment.status, "PAID");
  assert.equal(payment.discountAmountCents, 1500, "sin esto, la medición por código sale siempre a cero");
  assert.notEqual(payment.couponId, null, "y el descuento tiene que poder atribuirse a SU código");

  // Reentrega: la guarda de `status === "PAID"` corta antes, así que ni el bono
  // ni el descuento se duplican.
  await reconcileConnectCheckoutCompleted(f.orgId, session);
  const otraVez = await prisma.payment.findUniqueOrThrow({ where: { stripeCheckoutSessionId: sessionId } });
  assert.equal(otraVez.discountAmountCents, 1500);
  assert.equal(await prisma.payment.count({ where: { orgId: f.orgId } }), 1);
});

test("una cuota recurrente con código también registra su descuento", async () => {
  const f = await createFixture("cuota");
  const invoiceId = `in_${SUFFIX}-cuota`;

  const invoice = {
    id: invoiceId,
    subscription: f.stripeSubscriptionId,
    amount_paid: 4500,
    amount_due: 4500,
    // Ojo con la versión de API fijada (2026-07-29.dahlia): en una factura el
    // cupón del `Discount` cuelga de `discount.source`, no de `discount.coupon`
    // — la sesión de checkout sí lo lleva plano. Son dos formas distintas, y
    // equivocarse deja el importe bien y la atribución al código en nada.
    total_discount_amounts: [
      { amount: 1500, discount: { source: { type: "coupon", coupon: { id: "co_fidelidad", name: "Fidelidad" } } } },
    ],
    lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86_400 } }] },
  } as unknown as Stripe.Invoice;

  const result = await reconcileMemberInvoicePaid(f.orgId, invoice);
  assert.equal(result.ok, true);

  const payment = await prisma.payment.findUniqueOrThrow({ where: { stripeInvoiceId: invoiceId } });
  assert.equal(payment.discountAmountCents, 1500);
  assert.notEqual(payment.couponId, null);
});
