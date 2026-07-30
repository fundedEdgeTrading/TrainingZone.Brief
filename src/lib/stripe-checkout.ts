import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { createMemberCheckout, isRecurring } from "@/lib/member-billing";
import { createPaymentWithReceipt } from "@/lib/payments";
import { confirmLeadClosureForMember, revertLeadClosureForFailedPayment } from "@/lib/leads-queries";
import { createMemberWithInvitation, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";

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

/**
 * Conciliación de `checkout.session.completed` en la cuenta CONECTADA (Parte C, D1). Un único
 * punto de entrada para los dos orígenes posibles de un checkout de socio, distinguidos por el
 * metadata que le puso `member-billing.ts` al crearlo:
 * - `metadata.memberId`: socio ya existente (recepción/portal, o renovación desde la landing).
 * - `metadata.prospectEmail` sin `memberId`: prospecto nuevo desde la landing pública
 *   (`/hazte-socio`) — el `Member` nace aquí mismo, no existía antes del pago.
 */
export async function reconcileConnectCheckoutCompleted(orgId: string, session: Stripe.Checkout.Session) {
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const meta = session.metadata ?? {};

  if (meta.memberId) {
    await reconcileMemberCheckoutSession(orgId, meta.memberId, session, paymentIntentId);
    return;
  }

  if (meta.prospectEmail) {
    await provisionMemberFromLandingCheckout(orgId, session, paymentIntentId);
    return;
  }

  // Ni memberId ni prospectEmail: no debería darse (todo checkout de socio pasa
  // por member-billing.ts, que siempre pone uno de los dos), pero se mantiene
  // el comportamiento histórico (solo marcar el Payment PAID) en vez de tirar
  // el evento, por robustez ante metadata inesperado.
  await reconcileLegacyCheckoutCompleted(session.id, paymentIntentId);
}

/**
 * Socio ya existente (D1, hueco cerrado): además de marcar el `Payment` PAID
 * (como hacía siempre), si el plan comprado es puntual (`!isRecurring`) crea
 * el bono (`Subscription`) correspondiente — hasta ahora comprar un bono
 * puntual por Stripe nunca dejaba al socio con nada reservable, solo un
 * `Payment` en el histórico. Recurrente: no se toca nada aquí, lo cubre
 * `customer.subscription.created` (reconcileMemberSubscriptionUpserted).
 *
 * Idempotente por `Payment.status`: si el Payment ya estaba PAID (redelivery
 * del webhook), no se repite la creación del bono ni el resto del efecto.
 */
async function reconcileMemberCheckoutSession(
  orgId: string,
  memberId: string,
  session: Stripe.Checkout.Session,
  paymentIntentId: string | null
) {
  const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: session.id, orgId } });
  if (!payment) return;
  if (payment.status === "PAID") return; // ya conciliado — redelivery del webhook

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", stripePaymentIntentId: paymentIntentId, receiptNumber: payment.receiptNumber ?? `STRIPE-${payment.id.slice(-8)}` },
  });

  const planId = session.metadata?.planId;
  if (planId) {
    const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId } });
    if (plan && !isRecurring(plan.type)) {
      const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { primaryCenterId: true } });
      if (member) {
        const centerId = session.metadata?.centerId || member.primaryCenterId;
        const subscription = await prisma.subscription.create({
          data: {
            memberId,
            planId: plan.id,
            centerId,
            startDate: new Date(),
            priceCents: plan.priceCents,
            status: "ACTIVE",
            sessionsRemaining: plan.sessionsIncluded ?? null,
          },
        });
        await prisma.payment.update({ where: { id: payment.id }, data: { subscriptionId: subscription.id } });
      }
    }
  }

  await confirmLeadClosureForMember(orgId, memberId);
}

/**
 * Prospecto nuevo desde la landing pública (`/hazte-socio`, sin sesión): el
 * `Member` no existía antes del pago (`createProspectMemberCheckout` no lo
 * crea — nace aquí, igual que una organización nace en
 * `provisionOrganizationFromCheckout`).
 */
async function provisionMemberFromLandingCheckout(orgId: string, session: Stripe.Checkout.Session, paymentIntentId: string | null) {
  const meta = session.metadata ?? {};
  const email = meta.prospectEmail?.trim().toLowerCase();
  const planId = meta.planId;
  const centerId = meta.centerId;
  if (!email || !planId || !centerId) {
    console.error("[webhook] provisionMemberFromLandingCheckout: metadata incompleto", { sessionId: session.id, meta });
    return;
  }

  try {
    // 1. Re-comprobación idempotente: una redelivery del webhook, o el propio
    //    socio dándose de alta por otra vía mientras el pago estaba en curso,
    //    no debe crear una segunda ficha (RB-ALTA-003).
    const existing = await prisma.member.findFirst({ where: { orgId, email }, select: { id: true } });
    if (existing) {
      await reconcileMemberCheckoutSession(orgId, existing.id, session, paymentIntentId);
      return;
    }

    const [plan, center] = await Promise.all([
      prisma.membershipPlan.findFirst({ where: { id: planId, orgId } }),
      prisma.center.findFirst({ where: { id: centerId, orgId }, select: { id: true, name: true } }),
    ]);
    if (!plan || !center) {
      console.error("[webhook] provisionMemberFromLandingCheckout: plan o centro no encontrado", { orgId, planId, centerId });
      return;
    }

    const firstName = meta.prospectFirstName?.trim() || "Nuevo";
    const lastName = meta.prospectLastName?.trim() || "socio";
    const phone = meta.prospectPhone?.trim() || null;

    // 2. Alta nueva: mismo camino que el alta manual de recepción
    //    (members/actions.ts::createMember) — Member + Subscription(es) +
    //    Invitation, todo en una transacción.
    const { member, invitation, subscriptions } = await prisma.$transaction((tx) =>
      createMemberWithInvitation(tx, {
        orgId,
        primaryCenterId: center.id,
        firstName,
        lastName,
        email,
        phone,
        bonos: [{ planId: plan.id, centerId: center.id }],
      })
    );

    const subscription = subscriptions[0];
    if (!subscription) {
      console.error("[webhook] provisionMemberFromLandingCheckout: no se pudo crear el bono", { memberId: member.id, planId });
    } else if (session.mode === "subscription") {
      // El Member no existía cuando se creó el checkout, así que
      // `subscription_data.metadata` no llevaba `memberId`: sin este enganche
      // manual, `reconcileMemberSubscriptionUpserted` no encontraría a quién
      // asignar la Subscription de Stripe cuando llegue `customer.subscription.created`.
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (stripeSubscriptionId) {
        await prisma.subscription.update({ where: { id: subscription.id }, data: { stripeSubscriptionId } });
      }
    } else {
      await createPaymentWithReceipt({
        orgId,
        memberId: member.id,
        subscriptionId: subscription.id,
        amountCents: plan.priceCents,
        method: "STRIPE",
        status: "PAID",
        date: new Date(),
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        notes: `Alta desde landing — ${plan.name}`,
      });
    }

    // 3. Email de bienvenida — idéntico al del alta manual (RB-MARCA-001),
    //    best-effort: el socio ya está guardado, un SMTP lento no debe
    //    bloquear el webhook.
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } });
    void sendMail({
      to: email,
      fromName: org?.name ?? "Training Zone",
      subject: `¡Bienvenida a ${org?.name ?? "Training Zone"}, ${firstName}! 🎉 Tu acceso te espera`,
      html: renderMemberWelcomeEmail({
        memberFirstName: firstName,
        orgName: org?.name ?? "Training Zone",
        orgLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
        centerName: center.name,
        onboardingUrl: onboardingUrlFor(invitation.token),
      }),
    });
  } catch (error) {
    // 4. El webhook nunca debe tumbarse por esto: Stripe reintentaría
    //    indefinidamente un 500. Se registra y se corta aquí.
    console.error("[webhook] provisionMemberFromLandingCheckout: fallo inesperado", error);
  }
}

/** Comportamiento previo a D1 (RB-LEAD-005): solo marca el Payment PAID y cierra el lead si venía de uno. */
async function reconcileLegacyCheckoutCompleted(checkoutSessionId: string, paymentIntentId: string | null) {
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
