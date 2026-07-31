import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { createPaymentWithReceipt } from "@/lib/payments";
import { createNotificationOnce } from "@/lib/notifications";
import type { PlanType, SubscriptionStatus } from "@prisma/client";

export type MemberCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

function appBaseUrl() {
  return (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * F5: MONTHLY y ONLINE son cuota recurrente (se cobran cada mes mientras el
 * socio no cause baja). SESSION_PACK, DROP_IN, DUO y PERSONAL_TRAINING son
 * bonos puntuales: se agotan y el socio compra otro, nunca se renuevan solos.
 */
export function isRecurring(planType: PlanType): boolean {
  return planType === "MONTHLY" || planType === "ONLINE";
}

/**
 * Crea o recupera el producto/precio espejo del plan en la cuenta CONECTADA
 * del gimnasio (RB-VENTA-002). Perezoso e idempotente: si ya hay
 * `stripePriceId` y la cuenta conectada actual coincide con la que lo creó,
 * lo devuelve tal cual sin llamar a Stripe — el precio remoto solo puede
 * cambiar si alguien lo edita a mano en el Dashboard de Stripe (fuera de
 * nuestro control) o si este mismo flujo lo recrea, así que verificarlo con
 * `prices.retrieve` en cada checkout añadiría una llamada de red por venta
 * sin beneficio real. Si no hay precio o la cuenta conectada cambió (el
 * gimnasio reconectó otra), crea producto y/o precio nuevos — nunca borra el
 * anterior: puede haber `Subscription` vivas colgando de él.
 */
export async function ensureStripePrice(orgId: string, planId: string): Promise<{ ok: true; priceId: string } | { ok: false; error: string }> {
  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId } });
  if (!plan) return { ok: false, error: "Plan no encontrado." };

  if (plan.stripePriceId && plan.stripeAccountId === accountId) {
    return { ok: true, priceId: plan.stripePriceId };
  }

  const accountMatches = plan.stripeAccountId === accountId;
  const productId =
    accountMatches && plan.stripeProductId
      ? plan.stripeProductId
      : (await stripe.products.create({ name: plan.name }, { stripeAccount: accountId })).id;

  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "eur",
      unit_amount: plan.priceCents,
      ...(isRecurring(plan.type) ? { recurring: { interval: "month" as const } } : {}),
    },
    { stripeAccount: accountId }
  );

  await prisma.membershipPlan.update({
    where: { id: plan.id },
    data: { stripeProductId: productId, stripePriceId: price.id, stripeAccountId: accountId },
  });

  return { ok: true, priceId: price.id };
}

/**
 * Checkout de socio (Parte C): recurrente (`mode:"subscription"`) para MONTHLY/ONLINE,
 * puntual (`mode:"payment"`) para el resto. `origin` distingue quién lo inició —
 * recepción ("staff") o el propio socio desde su portal ("portal", F6) — y hoy
 * solo cambia el `success_url`/`cancel_url` de vuelta.
 *
 * Bizum no entra aquí en ningún caso: según la documentación de Stripe está
 * pensado para pagos únicos, no para suscripciones recurrentes, y esta función
 * es el único punto de entrada para ambos modos — restringir siempre a
 * card/sepa_debit evita ofrecerlo por accidente en un checkout recurrente.
 */
export async function createMemberCheckout(params: {
  orgId: string;
  memberId: string;
  planId: string;
  soldByUserId?: string;
  origin: "staff" | "portal" | "landing";
  // Centro donde queda el bono/suscripción (RB-AGENDA-003): si se omite (los
  // call sites de F5 no lo pasaban), cae al centro habitual del socio — así no
  // se rompe ningún call site existente.
  centerId?: string;
}): Promise<MemberCheckoutResult> {
  const { orgId, memberId, planId, soldByUserId, origin } = params;

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  const [member, plan] = await Promise.all([
    prisma.member.findFirst({
      where: { id: memberId, orgId },
      select: { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true, stripeAccountId: true, primaryCenterId: true },
    }),
    prisma.membershipPlan.findFirst({ where: { id: planId, orgId }, select: { id: true, name: true, priceCents: true, type: true } }),
  ]);
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  const centerId = params.centerId ?? member.primaryCenterId;

  const priceResult = await ensureStripePrice(orgId, planId);
  if (!priceResult.ok) return { ok: false, error: priceResult.error };

  // El cliente de Stripe del socio vive en la cuenta conectada del gimnasio: si
  // no existe aún, o si el gimnasio reconectó otra cuenta, hay que crear uno
  // nuevo ahí (el de la cuenta anterior no es válido en la nueva).
  let stripeCustomerId = member.stripeCustomerId;
  if (!stripeCustomerId || member.stripeAccountId !== accountId) {
    const customer = await stripe.customers.create(
      { email: member.email, name: `${member.firstName} ${member.lastName}` },
      { stripeAccount: accountId }
    );
    stripeCustomerId = customer.id;
    await prisma.member.update({ where: { id: member.id }, data: { stripeCustomerId, stripeAccountId: accountId } });
  }

  const recurring = isRecurring(plan.type);
  // "landing" (checkout público anónimo, sin sesión) no tiene ni /billing ni
  // /portal/membresia a los que volver: aterriza en una confirmación pública
  // genérica, igual que el checkout anónimo de organizaciones vuelve a
  // /activar en vez de a un panel (platform-billing.ts). "portal" (F6) vuelve
  // a /portal/membresia (hero + renovar/ampliar + historial, fusión de las
  // antiguas /portal/plan y /portal/comprar).
  const returnPath = origin === "portal" ? "/portal/membresia" : origin === "landing" ? "/hazte-socio/gracias" : "/billing";

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: recurring ? "subscription" : "payment",
      customer: stripeCustomerId,
      line_items: [{ price: priceResult.priceId, quantity: 1 }],
      payment_method_types: recurring ? ["card", "sepa_debit"] : ["card"],
      success_url: `${appBaseUrl()}${returnPath}?checkout=success`,
      cancel_url: `${appBaseUrl()}${returnPath}?checkout=cancelled`,
      metadata: { orgId, memberId, planId, centerId, ...(soldByUserId ? { soldByUserId } : {}) },
      // Stripe copia este metadata a la Subscription resultante (no el del
      // checkout.session), que es donde lo lee el webhook al recibir
      // `customer.subscription.created` para reconstruir el contexto sin adivinar.
      ...(recurring ? { subscription_data: { metadata: { orgId, memberId, planId, centerId } } } : {}),
    },
    { stripeAccount: accountId }
  );

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };

  // Puntual: el Payment PENDING se crea aquí, igual que hacía siempre
  // stripe-checkout.ts, y el webhook lo concilia a PAID/FAILED. Recurrente: no
  // se crea nada aquí — lo crea el webhook al recibir `invoice.paid`, para no
  // dejar un Payment fantasma si el socio nunca llega a completar el pago.
  if (!recurring) {
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
  }

  return { ok: true, url: checkoutSession.url };
}

/**
 * Checkout público anónimo (landing `/hazte-socio`) para un prospecto que
 * TODAVÍA no es socio: a diferencia de `createMemberCheckout`, no hay
 * `Member` ni cliente de Stripe que reutilizar — nace todo del webhook tras
 * el pago (mismo patrón que el alta de organizaciones, `platform-billing.ts`).
 * `customer_email` le basta a Stripe para crear el customer al completar; no
 * hace falta crearlo aquí.
 *
 * El metadata deliberadamente NO lleva `memberId`: es la señal que usa
 * `checkout.session.completed` en el webhook para distinguir esto de una
 * compra de un socio existente (ver `stripe-checkout.ts`).
 */
export async function createProspectMemberCheckout(params: {
  orgId: string;
  centerId: string;
  planId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}): Promise<MemberCheckoutResult> {
  const { orgId, centerId, planId, firstName, lastName, email, phone } = params;

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId }, select: { id: true, type: true } });
  if (!plan) return { ok: false, error: "Plan no encontrado." };

  const priceResult = await ensureStripePrice(orgId, planId);
  if (!priceResult.ok) return { ok: false, error: priceResult.error };

  const recurring = isRecurring(plan.type);
  const metadata = {
    orgId,
    centerId,
    planId,
    prospectFirstName: firstName,
    prospectLastName: lastName,
    prospectEmail: email,
    prospectPhone: phone ?? "",
  };

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: recurring ? "subscription" : "payment",
      customer_email: email,
      line_items: [{ price: priceResult.priceId, quantity: 1 }],
      payment_method_types: recurring ? ["card", "sepa_debit"] : ["card"],
      success_url: `${appBaseUrl()}/hazte-socio/gracias?checkout=success`,
      cancel_url: `${appBaseUrl()}/hazte-socio/gracias?checkout=cancelled`,
      metadata,
      // El Member no existe todavía cuando se crea este checkout, así que el
      // fallback de `reconcileMemberSubscriptionUpserted` por `metadata.memberId`
      // no puede servir aquí: se le pasa `prospectEmail` para que no confunda
      // esto con una suscripción huérfana, y quede en no-op hasta que
      // `checkout.session.completed` cree el Member y enganche
      // `stripeSubscriptionId` a mano (ver `provisionMemberFromLandingCheckout`).
      ...(recurring ? { subscription_data: { metadata: { orgId, centerId, planId, prospectEmail: email } } } : {}),
    },
    { stripeAccount: accountId }
  );

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };

  return { ok: true, url: checkoutSession.url };
}

/**
 * Autoservicio (F6): sesión del Billing Portal de Stripe en la cuenta
 * conectada del gimnasio, para que el socio gestione método de pago/facturas/
 * baja sin que Apta toque nunca datos de tarjeta.
 */
export async function createMemberBillingPortalSession(orgId: string, memberId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { stripeCustomerId: true } });
  if (!member?.stripeCustomerId) return { ok: false, error: "Este socio todavía no tiene un cliente de Stripe." };

  const portalSession = await stripe.billingPortal.sessions.create(
    { customer: member.stripeCustomerId, return_url: `${appBaseUrl()}/portal/membresia` },
    { stripeAccount: accountId }
  );

  return { ok: true, url: portalSession.url };
}

// ---------- Webhook (cuenta conectada): conciliación de Stripe Billing ----------
// Todo lo de aquí abajo lo llama exclusivamente `handleConnectEvent` del
// webhook (src/app/api/stripe/webhook/route.ts), que ya resolvió `orgId` a
// partir de `event.account` y descarta el evento si no reconoce la cuenta.
// Cada función acota además sus propias lecturas/escrituras a ese `orgId`
// (frontera de aislamiento del Plano 2, aunque el evento ya venga acotado por
// cuenta conectada — defensa en profundidad).

/**
 * Mapeo de `Stripe.Subscription.status` a `SubscriptionStatus` (el schema no
 * tiene un estado 1:1 para cada uno de Stripe): `active`/`trialing` → ACTIVE;
 * `past_due`/`incomplete`/`paused` → FROZEN (hay un problema de cobro pero la
 * suscripción sigue viva en Stripe y puede recuperarse sola en el próximo
 * reintento — FROZEN es el único estado del schema que significa "sin acceso
 * pero no cancelada"; `Member.state = DELINQUENT`, que sí gatilla en
 * `invoice.payment_failed`, es la señal operativa real para recepción);
 * `canceled`/`unpaid` → CANCELLED (unpaid es lo que queda tras agotar los
 * reintentos de dunning sin cobrar); `incomplete_expired` → EXPIRED (nunca
 * llegó a cobrarse el primer periodo).
 */
function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "incomplete":
    case "paused":
      return "FROZEN";
    case "incomplete_expired":
      return "EXPIRED";
    case "canceled":
    case "unpaid":
      return "CANCELLED";
    default:
      return "FROZEN";
  }
}

/**
 * `Stripe.Invoice.subscription` ya no existe como campo de primer nivel en la
 * versión de API que tipa este SDK (se movió a
 * `invoice.parent.subscription_details.subscription`), pero el webhook de
 * plataforma (`handlePlatformEvent`, sin tocar en esta fase) sigue asumiendo
 * el shape legado por si la cuenta de Stripe está pinneada a una versión
 * anterior. Se comprueban ambos shapes por robustez.
 */
function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  const viaParent = invoice.parent?.subscription_details?.subscription;
  if (typeof viaParent === "string") return viaParent;
  if (viaParent && typeof viaParent === "object") return viaParent.id;

  return null;
}

/** `customer.subscription.created` / `.updated`. */
export async function reconcileMemberSubscriptionUpserted(orgId: string, subscription: Stripe.Subscription) {
  const status = mapStripeSubscriptionStatus(subscription.status);
  const item = subscription.items.data[0];
  const endDate = item?.current_period_end ? new Date(item.current_period_end * 1000) : undefined;

  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, member: { select: { orgId: true } } },
  });

  if (existing) {
    if (existing.member.orgId !== orgId) return; // aislamiento: la suscripción no es de esta org
    await prisma.subscription.update({ where: { id: existing.id }, data: { status, ...(endDate ? { endDate } : {}) } });
    return;
  }

  // Primera vez que la vemos: Stripe copia `subscription_data.metadata` (puesto
  // por `createMemberCheckout`) a la Subscription resultante — es el único
  // contexto fiable para reconstruirla sin adivinar. Si falta o no coincide con
  // la org del evento, no se crea nada (mejor perder el alta que mezclar datos
  // entre organizaciones).
  const meta = subscription.metadata;
  if (meta.orgId !== orgId || !meta.memberId || !meta.planId) return;

  const [member, plan] = await Promise.all([
    prisma.member.findFirst({ where: { id: meta.memberId, orgId }, select: { id: true, primaryCenterId: true } }),
    prisma.membershipPlan.findFirst({ where: { id: meta.planId, orgId }, select: { id: true, priceCents: true } }),
  ]);
  if (!member || !plan) return;

  const startDate = item?.current_period_start ? new Date(item.current_period_start * 1000) : new Date();

  await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      // El checkout de socio no pide centro (el plan MONTHLY/ONLINE es de
      // organización, no de un centro concreto): arranca en el centro
      // habitual del socio, igual que cualquier bono se puede reasignar
      // luego a mano si hiciera falta.
      centerId: member.primaryCenterId,
      startDate,
      endDate,
      status,
      priceCents: plan.priceCents,
      stripeSubscriptionId: subscription.id,
    },
  });
}

/** `customer.subscription.deleted`. */
export async function reconcileMemberSubscriptionDeleted(orgId: string, subscription: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id, member: { orgId } },
    data: { status: "CANCELLED" },
  });
}

/** `invoice.paid`: cobro recurrente conciliado — idempotente por `Payment.stripeInvoiceId`. */
export async function reconcileMemberInvoicePaid(orgId: string, invoice: Stripe.Invoice) {
  if (!invoice.id) return;
  const already = await prisma.payment.findUnique({ where: { stripeInvoiceId: invoice.id }, select: { id: true } });
  if (already) return;

  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { id: true, memberId: true, member: { select: { orgId: true, state: true } } },
  });
  if (!subscription || subscription.member.orgId !== orgId) return; // aislamiento

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;

  await createPaymentWithReceipt({
    orgId,
    memberId: subscription.memberId,
    subscriptionId: subscription.id,
    amountCents: invoice.amount_paid,
    method: "STRIPE",
    status: "PAID",
    date: new Date(),
    stripeInvoiceId: invoice.id,
    notes: "Factura recurrente Stripe",
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE", ...(periodEnd ? { endDate: new Date(periodEnd * 1000) } : {}) },
  });

  if (subscription.member.state === "DELINQUENT") {
    await prisma.member.update({ where: { id: subscription.memberId }, data: { state: "ACTIVE" } });
  }
}

/** `invoice.payment_failed`: marca al socio moroso y avisa a recepción/dirección — idempotente por `Payment.stripeInvoiceId`. */
export async function reconcileMemberInvoicePaymentFailed(orgId: string, invoice: Stripe.Invoice) {
  if (!invoice.id) return;

  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return;

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: {
      id: true,
      memberId: true,
      member: { select: { orgId: true, firstName: true, lastName: true } },
    },
  });
  if (!subscription || subscription.member.orgId !== orgId) return; // aislamiento

  const existing = await prisma.payment.findUnique({ where: { stripeInvoiceId: invoice.id }, select: { id: true } });
  if (existing) {
    // Stripe reintenta el cobro varias veces en el mismo ciclo de dunning:
    // no duplicar la fila, basta con dejarla en FAILED.
    await prisma.payment.update({ where: { id: existing.id }, data: { status: "FAILED" } });
  } else {
    await createPaymentWithReceipt({
      orgId,
      memberId: subscription.memberId,
      subscriptionId: subscription.id,
      amountCents: invoice.amount_due,
      method: "STRIPE",
      status: "FAILED",
      date: new Date(),
      stripeInvoiceId: invoice.id,
      notes: "Factura recurrente Stripe impagada",
    });
  }

  await prisma.member.update({ where: { id: subscription.memberId }, data: { state: "DELINQUENT" } });

  // Aviso a recepción: reutiliza el motor de notificaciones de F10
  // (lib/notifications.ts), con el mismo grupo de roles que ya puede cobrar a
  // socios (billing/actions.ts) — createNotificationOnce evita duplicar el
  // aviso mientras la factura siga sin resolverse.
  const recipients = await prisma.user.findMany({
    where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR", "RECEPTION"] } },
    select: { id: true },
  });
  const memberName = `${subscription.member.firstName} ${subscription.member.lastName}`;
  for (const recipient of recipients) {
    await createNotificationOnce({
      orgId,
      recipientUserId: recipient.id,
      kind: "ALERT",
      title: `${memberName}: cobro recurrente fallido`,
      body: "Stripe no ha podido cobrar la cuota de este mes. Revisa el método de pago del socio.",
      entityType: "Member",
      entityId: subscription.memberId,
    });
  }
}
