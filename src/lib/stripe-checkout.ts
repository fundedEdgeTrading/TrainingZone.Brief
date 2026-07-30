import { prisma } from "@/lib/prisma";
import { createMemberCheckout } from "@/lib/member-billing";
import { confirmLeadClosureForMember, revertLeadClosureForFailedPayment } from "@/lib/leads-queries";

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * RB-PAGO-001 + Parte C: cobro por Stripe (checkout) contra la cuenta conectada del gimnasio
 * (RB-PAGO-018/RB-CONNECT-002). Firma sin cambios (la llaman ya las páginas de recepción): por
 * dentro delega en member-billing.ts (F5), que decide "payment" o "subscription" según el tipo
 * de plan — cobrar un plan MONTHLY/ONLINE desde aquí ahora abre una suscripción recurrente de
 * verdad, en vez del cobro único de antes.
 */
export async function createCheckoutSession(orgId: string, memberId: string, planId: string, soldByUserId?: string): Promise<CheckoutResult> {
  return createMemberCheckout({ orgId, memberId, planId, soldByUserId, origin: "staff" });
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
