import type Stripe from "stripe";
import type { MembershipPlan } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecurring, type ReconcileResult } from "@/lib/member-billing";
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
 *
 * CHK-02 (RB-PAGO-002) · Devuelve el resultado en vez de tragarse el error: el
 * webhook responde 500 con `ok: false` para que Stripe reintente. Un alta ya
 * pagada que falla a medias se reintenta, no se pierde.
 */
export async function reconcileConnectCheckoutCompleted(orgId: string, session: Stripe.Checkout.Session): Promise<ReconcileResult> {
  try {
    return await reconcileCheckoutCompleted(orgId, session);
  } catch (error) {
    console.error("[webhook] checkout.session.completed no conciliado", { orgId, sessionId: session.id, error });
    return { ok: false, retry: true, error: error instanceof Error ? error.message : String(error) };
  }
}

async function reconcileCheckoutCompleted(orgId: string, session: Stripe.Checkout.Session): Promise<ReconcileResult> {
  // HU-ST-12/RB-PAGO-025 (pista P1) · Un adeudo directo SEPA completa el
  // checkout DÍAS antes de que el dinero se mueva, y llega aquí como
  // `complete` + `unpaid`. Todo lo que hay debajo —marcar el `Payment` PAID,
  // crear el bono— es justo lo que abriría el acceso sin haber cobrado, así
  // que se aplaza hasta `checkout.session.async_payment_succeeded`, que vuelve
  // a entrar por esta misma función con la sesión ya pagada.
  if (isAsyncPaymentPending(session)) {
    await holdAsyncCheckout(orgId, session);
    return { ok: true };
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const meta = session.metadata ?? {};

  if (meta.memberId) {
    await reconcileMemberCheckoutSession(orgId, meta.memberId, session, paymentIntentId);
    return { ok: true };
  }

  if (meta.prospectEmail) {
    return provisionMemberFromLandingCheckout(orgId, session, paymentIntentId);
  }

  // Ni memberId ni prospectEmail: no debería darse (todo checkout de socio pasa
  // por member-billing.ts, que siempre pone uno de los dos), pero se mantiene
  // el comportamiento histórico (solo marcar el Payment PAID) en vez de tirar
  // el evento, por robustez ante metadata inesperado.
  await reconcileLegacyCheckoutCompleted(session.id, paymentIntentId);
  return { ok: true };
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
 *
 * CHK-02 · Cada paso es reanudable, porque ahora un fallo devuelve `ok: false`
 * y Stripe reentrega el evento: la reentrega encuentra al socio ya creado y
 * completa lo que faltara, en vez de darse por satisfecha solo porque la ficha
 * existe.
 *   1. El socio (con su cuota, si es recurrente), en una transacción.
 *   2. Bono puntual: un `Payment` de la sesión y, sobre él, el camino común de
 *      `reconcileMemberCheckoutSession` (PAID + bono + libro mayor, atómico).
 */
async function provisionMemberFromLandingCheckout(
  orgId: string,
  session: Stripe.Checkout.Session,
  paymentIntentId: string | null
): Promise<ReconcileResult> {
  const meta = session.metadata ?? {};
  const email = meta.prospectEmail?.trim().toLowerCase();
  const planId = meta.planId;
  const centerId = meta.centerId;
  if (!email || !planId || !centerId) {
    console.error("[webhook] provisionMemberFromLandingCheckout: metadata incompleto", { sessionId: session.id, meta });
    return { ok: false, retry: false, error: `Checkout ${session.id} de la landing con metadata incompleto.` };
  }

  const [plan, center] = await Promise.all([
    prisma.membershipPlan.findFirst({ where: { id: planId, orgId } }),
    prisma.center.findFirst({ where: { id: centerId, orgId }, select: { id: true, name: true, address: true } }),
  ]);
  if (!plan || !center) {
    console.error("[webhook] provisionMemberFromLandingCheckout: plan o centro no encontrado", { orgId, planId, centerId });
    return { ok: false, retry: false, error: `Plan ${planId} o centro ${centerId} no encontrado en la organización.` };
  }

  // 1. Re-comprobación idempotente: una redelivery del webhook, o el propio
  //    socio dándose de alta por otra vía mientras el pago estaba en curso,
  //    no debe crear una segunda ficha (RB-ALTA-003).
  const existing = await prisma.member.findFirst({ where: { orgId, email }, select: { id: true } });
  const memberId = existing?.id ?? (await createLandingMember(orgId, session, plan, center, email));
  await rememberStripeCustomer(orgId, memberId, session);

  // 2. Bono puntual. El `Payment` se crea PENDING y lo concilia el camino
  //    común: si algo falla después, la reentrega lo encuentra y termina.
  if (session.mode !== "subscription" && !isRecurring(plan.type)) {
    const payment = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: session.id, orgId }, select: { id: true } });
    if (!payment) {
      await createPaymentWithReceipt({
        orgId,
        memberId,
        amountCents: plan.priceCents,
        method: "STRIPE",
        status: "PENDING",
        date: new Date(),
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        notes: `Alta desde landing — ${plan.name}`,
      });
    }
  }
  await reconcileMemberCheckoutSession(orgId, memberId, session, paymentIntentId);
  return { ok: true };
}

/**
 * CHK-03 · El socio que nace en la landing guarda su cliente de Stripe y la
 * cuenta conectada donde vive. Sin ellos el Billing Portal le dice que "todavía
 * no tiene un cliente de Stripe", y la siguiente compra le crea OTRO cliente
 * (`createMemberCheckout` crea uno nuevo si falta o si la cuenta no coincide).
 *
 * La cuenta es la de la organización: `StripeAccount.orgId` es único y es la
 * misma de la que el webhook ha resuelto `orgId` a partir de `event.account`.
 * Solo rellena lo que falta: una reentrega no reescribe nada, y un socio que
 * ya tenía su cliente lo conserva.
 */
async function rememberStripeCustomer(orgId: string, memberId: string, session: Stripe.Checkout.Session) {
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  // Un checkout `mode: "payment"` sin `customer_creation: "always"` paga como
  // invitado y no deja cliente: no hay nada que guardar.
  if (!customerId) return;
  const account = await prisma.stripeAccount.findUnique({ where: { orgId }, select: { accountId: true } });
  if (!account) return;
  await prisma.member.updateMany({
    where: { id: memberId, orgId, stripeCustomerId: null },
    data: { stripeCustomerId: customerId, stripeAccountId: account.accountId },
  });
}

/**
 * Alta nueva: mismo camino que el alta manual de recepción
 * (members/actions.ts::createMember) — Member + Invitation, y la cuota
 * recurrente con su `stripeSubscriptionId`, todo en una transacción. El bono
 * puntual NO nace aquí: lo crea `reconcileMemberCheckoutSession` a la vez que
 * marca el `Payment` PAID, que es la única forma de que no haya uno sin el otro.
 */
async function createLandingMember(
  orgId: string,
  session: Stripe.Checkout.Session,
  plan: MembershipPlan,
  center: { id: string; name: string; address: string | null },
  email: string
): Promise<string> {
  const meta = session.metadata ?? {};
  const firstName = meta.prospectFirstName?.trim() || "Nuevo";
  const lastName = meta.prospectLastName?.trim() || "socio";
  const phone = meta.prospectPhone?.trim() || null;
  const recurring = session.mode === "subscription";

  const { member, invitation } = await prisma.$transaction(async (tx) => {
    const created = await createMemberWithInvitation(tx, {
      orgId,
      primaryCenterId: center.id,
      firstName,
      lastName,
      email,
      phone,
      bonos: recurring ? [{ planId: plan.id, centerId: center.id }] : [],
    });
    if (recurring) {
      const subscription = created.subscriptions[0];
      if (!subscription) throw new Error(`No se pudo crear la cuota del plan ${plan.id} para ${created.member.id}.`);
      // El Member no existía cuando se creó el checkout, así que
      // `subscription_data.metadata` no llevaba `memberId`: sin este enganche
      // manual, `reconcileMemberSubscriptionUpserted` no encontraría a quién
      // asignar la Subscription de Stripe cuando llegue `customer.subscription.created`.
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (stripeSubscriptionId) {
        await tx.subscription.update({ where: { id: subscription.id }, data: { stripeSubscriptionId } });
      }
    }
    return created;
  });

  // Email de bienvenida — idéntico al del alta manual (RB-MARCA-001),
  // best-effort: el socio ya está guardado, un SMTP lento no debe bloquear el
  // webhook. Va justo tras crear la ficha y no al final: una reentrega ya no
  // pasa por aquí, así que si algo de después fallara el correo no saldría nunca.
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

  return member.id;
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
