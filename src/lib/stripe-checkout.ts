import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { isRecurring } from "@/lib/member-billing";
import { createPaymentWithReceipt } from "@/lib/payments";
import { confirmLeadClosureForMember, revertLeadClosureForFailedPayment } from "@/lib/leads-queries";
import { createMemberWithInvitation, onboardingUrlFor, absoluteUrl } from "@/lib/invitations";
import { sendMail } from "@/lib/mailer";
import { renderMemberWelcomeEmail } from "@/lib/emails/templates";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { createSubscriptionFromPlan } from "@/lib/subscriptions";
import { recordCheckoutDiscount } from "@/lib/stripe-coupons";
// HU-ST-12/RB-PAGO-025: el freno del cobro asíncrono. Vive en `stripe-mandate`
// (pista P1) porque es la misma marca que consulta el reconciliador de
// suscripciones para no abrir acceso con el débito en vuelo.
import { holdAsyncCheckout, isAsyncPaymentPending } from "@/lib/stripe-mandate";

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Conciliación de `checkout.session.completed` en la cuenta CONECTADA (Parte C, D1). Un único
 * punto de entrada para los dos orígenes posibles de un checkout de socio, distinguidos por el
 * metadata que le puso `member-billing.ts` al crearlo:
 * - `metadata.memberId`: socio ya existente (recepción/portal, o renovación desde la landing).
 * - `metadata.prospectEmail` sin `memberId`: prospecto nuevo desde la landing pública
 *   (`/hazte-socio`) — el `Member` nace aquí mismo, no existía antes del pago.
 */
export async function reconcileConnectCheckoutCompleted(orgId: string, session: Stripe.Checkout.Session) {
  // HU-ST-12/RB-PAGO-025 (pista P1) · Un adeudo directo SEPA completa el
  // checkout DÍAS antes de que el dinero se mueva, y llega aquí como
  // `complete` + `unpaid`. Todo lo que hay debajo —marcar el `Payment` PAID,
  // crear el bono— es justo lo que abriría el acceso sin haber cobrado, así
  // que se aplaza hasta `checkout.session.async_payment_succeeded`, que vuelve
  // a entrar por esta misma función con la sesión ya pagada.
  if (isAsyncPaymentPending(session)) {
    await holdAsyncCheckout(orgId, session);
    return;
  }

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
 * CHK-01 · `Payment` PAID, bono y su asiento de `SessionLedger` van en UNA
 * transacción. Antes el `Payment` pasaba a PAID primero y el bono se creaba
 * después, fuera de ella: si algo fallaba entre medias, la reentrega de Stripe
 * salía por la guarda de "ya está PAID" y el socio quedaba cobrado y sin bono.
 *
 * La guarda de idempotencia mira lo que de verdad importa: con un plan puntual,
 * que el `Payment` tenga ya su bono (`subscriptionId`), no solo que esté PAID.
 * Viaja DENTRO del UPDATE condicional, así que dos entregas concurrentes no
 * crean dos bonos: la segunda espera al bloqueo de la fila y ya no casa.
 */
async function reconcileMemberCheckoutSession(
  orgId: string,
  memberId: string,
  session: Stripe.Checkout.Session,
  paymentIntentId: string | null
) {
  const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: session.id, orgId } });
  if (!payment) return;

  const planId = session.metadata?.planId;
  const plan = planId ? await prisma.membershipPlan.findFirst({ where: { id: planId, orgId } }) : null;
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { primaryCenterId: true } });
  const needsBono = !!plan && !isRecurring(plan.type) && !!member;

  // Ámbito de centro: el `centerId` del metadata lo puso nuestro servidor, pero
  // se comprueba igual que pertenece a la organización antes de colgarle un bono.
  let centerId = member?.primaryCenterId ?? null;
  const metaCenterId = session.metadata?.centerId;
  if (needsBono && metaCenterId) {
    const center = await prisma.center.findFirst({ where: { id: metaCenterId, orgId }, select: { id: true } });
    if (!center) throw new Error(`Centro ${metaCenterId} fuera de la organización ${orgId}.`);
    centerId = center.id;
  }

  const reconciled = await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: needsBono ? { id: payment.id, subscriptionId: null } : { id: payment.id, status: { not: "PAID" } },
      data: { status: "PAID", stripePaymentIntentId: paymentIntentId, receiptNumber: payment.receiptNumber ?? `STRIPE-${payment.id.slice(-8)}` },
    });
    if (claimed.count === 0) return false; // ya conciliado — redelivery del webhook

    if (needsBono && plan && centerId) {
      // `createSubscriptionFromPlan` deja el asiento PURCHASE del libro mayor con
      // el mismo cliente de transacción.
      const subscription = await createSubscriptionFromPlan(tx, { memberId, centerId, plan });
      await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: subscription.id } });
    }
    return true;
  });
  if (!reconciled) return;

  // HU-ST-27 (petición de P5): cuánto descuento se aplicó y con qué código. Es
  // lo que convierte "se usó un cupón" en "este código trajo N ventas y X €".
  // Va detrás de la guarda de reentrega de arriba, así que una redelivery del
  // webhook no la repite; sin descuento en la sesión, no hace nada.
  await recordCheckoutDiscount(orgId, session);

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
      prisma.center.findFirst({ where: { id: centerId, orgId }, select: { id: true, name: true, address: true } }),
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
    const footer = memberEmailFooterLinks(member.id);
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
        memberFullName: `${firstName} ${lastName}`,
        postalAddress: center.address ?? undefined,
        prefsToken: footer.token,
      }),
      unsubscribeUrl: footer.oneClickUnsubscribeUrl,
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
