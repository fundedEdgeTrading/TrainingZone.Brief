import { prisma } from "@/lib/prisma";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";
import { confirmLeadClosureForMember, revertLeadClosureForFailedPayment } from "@/lib/leads-queries";

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

function appBaseUrl() {
  return (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/** RB-PAGO-001: cobro por Stripe (checkout). Sustituye el cobro manual como canal principal. */
export async function createCheckoutSession(orgId: string, memberId: string, planId: string, soldByUserId?: string): Promise<CheckoutResult> {
  if (!isStripeConfigured()) {
    return { ok: false, error: "Stripe no está configurado en este entorno (falta STRIPE_SECRET_KEY)." };
  }
  const stripe = getStripeClient()!;

  const [member, plan] = await Promise.all([
    prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true, email: true, firstName: true, lastName: true } }),
    prisma.membershipPlan.findFirst({ where: { id: planId, orgId }, select: { id: true, name: true, priceCents: true } }),
  ]);
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!plan) return { ok: false, error: "Plan no encontrado." };

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: member.email,
    line_items: [{ price_data: { currency: "eur", product_data: { name: plan.name }, unit_amount: plan.priceCents }, quantity: 1 }],
    success_url: `${appBaseUrl()}/billing?checkout=success`,
    cancel_url: `${appBaseUrl()}/billing?checkout=cancelled`,
    metadata: { orgId, memberId, planId, ...(soldByUserId ? { soldByUserId } : {}) },
  });

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };

  await prisma.payment.create({
    data: {
      orgId,
      memberId,
      amountCents: plan.priceCents,
      method: "STRIPE",
      status: "PENDING",
      date: new Date(),
      stripeCheckoutSessionId: checkoutSession.id,
      soldByUserId: soldByUserId ?? null,
      notes: `Checkout Stripe — ${plan.name}`,
    },
  });

  return { ok: true, url: checkoutSession.url };
}

/** Conciliación del webhook (F12): confirma o revierte el cobro y, si venía de un lead, cierra el bucle (RB-LEAD-005). */
export async function reconcileStripeCheckoutCompleted(checkoutSessionId: string, paymentIntentId: string | null) {
  const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: checkoutSessionId } });
  if (!payment) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", stripePaymentIntentId: paymentIntentId, receiptNumber: payment.receiptNumber ?? `STRIPE-${payment.id.slice(-8)}` },
  });
  await confirmLeadClosureForMember(payment.orgId, payment.memberId);
}

export async function reconcileStripePaymentFailed(checkoutSessionId: string) {
  const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: checkoutSessionId } });
  if (!payment) return;

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
  await revertLeadClosureForFailedPayment(payment.orgId, payment.memberId);
}
