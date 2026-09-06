import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { isRecurring } from "@/lib/member-billing";
import type { PaymentStatus, SubscriptionStatus } from "@prisma/client";

/**
 * E5-02: lo que "Mi membresía" necesita para dejar de ser la pantalla que no
 * dice cuánto paga el socio (`rbac.ts` ya no restringe esto: nunca hubo un
 * predicado de permiso que lo impidiera, solo faltaba la consulta). Vive
 * aparte de `portal-queries.ts` (de la pista de reservas, T2) porque necesita
 * leer suscripciones FROZEN además de ACTIVE — `getMemberForUser` solo trae
 * las activas — y golpear Stripe para el método de pago.
 */

export type MemberReceipt = {
  id: string;
  date: Date;
  concept: string;
  amountCents: number;
  status: PaymentStatus;
  /** Solo los cobros de Stripe conservan un comprobante descargable. */
  downloadable: boolean;
};

export type MemberBillingSnapshot = {
  hasSubscription: boolean;
  recurring: boolean;
  priceCents: number | null;
  planName: string | null;
  status: SubscriptionStatus | null;
  /** RB-PAGO-006: baja programada — sigue con acceso hasta esta fecha. */
  cancelAt: Date | null;
  /** RB-PAGO-004: congelación — null + status FROZEN = indefinida. */
  pauseUntil: Date | null;
  /** Solo en cuota recurrente: cuándo y con qué tarjeta se cobra el próximo ciclo. */
  nextChargeAt: Date | null;
  cardLast4: string | null;
  /** Solo en bono puntual: cuándo caduca (nunca "próximo cobro", que no existe). */
  expiresAt: Date | null;
  receipts: MemberReceipt[];
};

function receiptConcept(p: { notes: string | null; subscription: { plan: { name: string } } | null }): string {
  return p.notes || p.subscription?.plan.name || "Pago";
}

export async function getMemberBillingSnapshot(orgId: string, memberId: string): Promise<MemberBillingSnapshot> {
  const [subscription, payments] = await Promise.all([
    prisma.subscription.findFirst({
      where: { memberId, status: { in: ["ACTIVE", "FROZEN"] } },
      orderBy: { startDate: "desc" },
      select: {
        priceCents: true,
        status: true,
        cancelAt: true,
        pauseUntil: true,
        endDate: true,
        stripeSubscriptionId: true,
        plan: { select: { name: true, type: true } },
      },
    }),
    prisma.payment.findMany({
      where: { memberId, orgId, status: { in: ["PAID", "FAILED", "REFUNDED"] } },
      orderBy: { date: "desc" },
      take: 24,
      select: {
        id: true,
        date: true,
        amountCents: true,
        status: true,
        notes: true,
        stripeInvoiceId: true,
        stripeCheckoutSessionId: true,
        subscription: { select: { plan: { select: { name: true } } } },
      },
    }),
  ]);

  const receipts: MemberReceipt[] = payments.map((p) => ({
    id: p.id,
    date: p.date,
    concept: receiptConcept(p),
    amountCents: p.amountCents,
    status: p.status,
    downloadable: p.status === "PAID" && !!(p.stripeInvoiceId || p.stripeCheckoutSessionId),
  }));

  if (!subscription) {
    return {
      hasSubscription: false,
      recurring: false,
      priceCents: null,
      planName: null,
      status: null,
      cancelAt: null,
      pauseUntil: null,
      nextChargeAt: null,
      cardLast4: null,
      expiresAt: null,
      receipts,
    };
  }

  const recurring = isRecurring(subscription.plan.type);
  let nextChargeAt = recurring ? subscription.endDate : null;
  let cardLast4: string | null = null;

  // Método de pago y próximo cobro exacto: se golpea Stripe en vivo (no hay
  // caché local del método de pago). Si falla o el gimnasio no tiene Stripe
  // configurado, la pantalla degrada sin `cardLast4` en vez de romperse — el
  // `endDate` reconciliado por el webhook (`reconcileMemberSubscriptionUpserted`)
  // ya sirve de fecha aproximada de "próximo cobro".
  if (recurring && subscription.stripeSubscriptionId) {
    try {
      const resolved = await stripeForOrg(orgId);
      if (resolved.ok) {
        const stripeSub = await resolved.stripe.subscriptions.retrieve(
          subscription.stripeSubscriptionId,
          { expand: ["default_payment_method"] },
          { stripeAccount: resolved.accountId }
        );
        const pm = stripeSub.default_payment_method;
        if (pm && typeof pm === "object") {
          cardLast4 = pm.card?.last4 ?? pm.sepa_debit?.last4 ?? null;
        }
        const item = stripeSub.items.data[0];
        if (item?.current_period_end) nextChargeAt = new Date(item.current_period_end * 1000);
      }
    } catch {
      // Degrada sin tarjeta ni fecha exacta — ver comentario arriba.
    }
  }

  return {
    hasSubscription: true,
    recurring,
    priceCents: subscription.priceCents,
    planName: subscription.plan.name,
    status: subscription.status,
    cancelAt: subscription.cancelAt,
    pauseUntil: subscription.pauseUntil,
    nextChargeAt,
    cardLast4,
    expiresAt: recurring ? null : subscription.endDate,
    receipts,
  };
}
