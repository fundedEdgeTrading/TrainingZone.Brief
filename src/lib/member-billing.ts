import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { createPaymentWithReceipt } from "@/lib/payments";
import { createNotificationOnce } from "@/lib/notifications";
import { sendMail } from "@/lib/mailer";
import { renderPaymentFailedEmail } from "@/lib/emails/templates";
import { generateMemberDunningToken, memberBillingUrlFor } from "@/lib/email-verification";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import type { PlanType, SubscriptionStatus } from "@prisma/client";
import { createSubscriptionFromPlan } from "@/lib/subscriptions";
import { absoluteUrl, publicOrigin } from "@/lib/site";
// HU-ST-02: la resolución del id de suscripción de una factura es la misma para
// los dos planos y vive en un solo sitio desde que el plano 1 se quedó con el
// shape legado.
import { resolveInvoicePeriodEnd, resolveInvoiceSubscriptionId } from "@/lib/stripe-invoice";
import { isDemoModeActive } from "@/lib/platform-plans";
import { demoMemberCheckoutUrl } from "@/lib/demo-member-checkout";
import { isRecurring } from "@/lib/plan-recurrence";
// HU-ST-04/RB-PAGO-022: ninguna creación contra Stripe sale sin clave de
// idempotencia. El patrón y el registro de claves están en el módulo.
import {
  customerKey,
  memberCheckoutKey,
  priceKey,
  productKey,
  prospectCheckoutKey,
} from "@/lib/stripe-idempotency";

export type MemberCheckoutResult = { ok: true; url: string } | { ok: false; error: string };

// F5: la regla de recurrencia vive en `plan-recurrence.ts` (ver allí por qué), y
// se sigue reexportando desde aquí: es donde la buscan todos los call sites.
export { isRecurring } from "@/lib/plan-recurrence";

/** HU-ST-08: mismo mensaje en las tres puertas de venta (recepción, portal, landing). */
export const PLAN_ARCHIVED_ERROR = "Ese producto está archivado y ya no se puede vender.";

export type CheckoutModeDecision = {
  mode: "payment" | "subscription";
  /** D-S2: Bizum SOLO en pagos únicos. */
  bizumAvailable: boolean;
};

/**
 * HU-ST-09 / decisión D-S2 · El modo del checkout y, con él, qué métodos de pago
 * caben. **Un solo sitio**: la exclusión de Bizum no se reparte por el código,
 * se deduce de `isRecurring()`.
 *
 * Bizum es un método de pago único: no tiene capacidad de recurrencia, así que
 * en `mode:"subscription"` Stripe no lo ofrece ni aunque el gimnasio lo tenga
 * activo. En `mode:"payment"` —bonos, sesiones sueltas, dúos, entrenamiento
 * personal— sí, y es el método que más pide un socio español.
 */
export function resolveCheckoutMode(planType: PlanType): CheckoutModeDecision {
  const recurring = isRecurring(planType);
  return { mode: recurring ? "subscription" : "payment", bizumAvailable: !recurring };
}

/** HU-ST-10: mismo mensaje en las tres puertas de venta de la app. */
export const PLAN_NOT_SELLABLE_IN_APP_ERROR =
  "Este plan solo se contrata desde la web del centro.";

/**
 * HU-ST-10 / decisión D-S3 · ¿Se puede vender este plan DESDE LA APP NATIVA?
 *
 * `ONLINE` es contenido digital que se consume dentro de la propia app, así que
 * cae potencialmente bajo la compra dentro de la aplicación obligatoria de App
 * Store y Google Play: venderlo por Stripe Checkout es motivo de rechazo. Los
 * planes presenciales —cuotas de sala, bonos de sesiones, entrenamiento
 * personal— quedan exentos: son bienes y servicios del mundo físico, y las dos
 * tiendas los permiten cobrar por fuera.
 *
 * La decisión de negocio ya está tomada: **el plan `ONLINE` no se vende desde
 * la app**. Sigue existiendo y vendiéndose en la web, que no está sujeta a las
 * reglas de las tiendas.
 *
 * Es una regla de SUPERFICIE, no de producto: `createMemberCheckout` no la
 * aplica, porque la misma compra por web es perfectamente legítima. La aplican
 * los endpoints de la app.
 */
export function isSellableInApp(planType: PlanType): boolean {
  return planType !== "ONLINE";
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
  // El plan se comprueba ANTES de resolver Stripe: que un producto esté
  // archivado no depende de si hay pasarela configurada, y con el orden
  // inverso el mensaje que veía recepción era "falta STRIPE_SECRET_KEY".
  const plan = await prisma.membershipPlan.findFirst({ where: { id: planId, orgId } });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (!plan.active) return { ok: false, error: PLAN_ARCHIVED_ERROR };

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  if (plan.stripePriceId && plan.stripeAccountId === accountId) {
    return { ok: true, priceId: plan.stripePriceId };
  }

  const accountMatches = plan.stripeAccountId === accountId;
  const recurringPlan = isRecurring(plan.type);
  const productId =
    accountMatches && plan.stripeProductId
      ? plan.stripeProductId
      : (
          await stripe.products.create(
            { name: plan.name },
            { stripeAccount: accountId, idempotencyKey: productKey(orgId, plan.id) }
          )
        ).id;

  // Dos ejecuciones en paralelo para el mismo plan (recepción y portal vendiendo
  // a la vez) creaban dos Product y dos Price. Con la clave, la segunda recibe
  // de Stripe exactamente los mismos objetos que la primera.
  const price = await stripe.prices.create(
    {
      product: productId,
      currency: "eur",
      unit_amount: plan.priceCents,
      ...(recurringPlan ? { recurring: { interval: "month" as const } } : {}),
    },
    {
      stripeAccount: accountId,
      idempotencyKey: priceKey(orgId, plan.id, plan.priceCents, recurringPlan),
    }
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

  const [member, plan] = await Promise.all([
    prisma.member.findFirst({
      where: { id: memberId, orgId },
      select: { id: true, email: true, firstName: true, lastName: true, stripeCustomerId: true, stripeAccountId: true, primaryCenterId: true },
    }),
    prisma.membershipPlan.findFirst({
      where: { id: planId, orgId },
      select: { id: true, name: true, priceCents: true, type: true, active: true },
    }),
  ]);
  if (!member) return { ok: false, error: "Socio no encontrado." };
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  // HU-ST-08: un plan archivado seguía siendo vendible desde recepción y desde
  // el portal web — solo el catálogo del socio filtraba por `active`. La regla
  // vive aquí, que es por donde pasan las tres superficies, y se comprueba antes
  // que la pasarela: no depende de que haya Stripe configurado.
  if (!plan.active) return { ok: false, error: PLAN_ARCHIVED_ERROR };

  const centerId = params.centerId ?? member.primaryCenterId;
  const returnPath = origin === "portal" ? "/portal/membresia" : origin === "landing" ? "/hazte-socio/gracias" : "/billing";

  // HU-ST-11/RB-PAGO-024: sin `STRIPE_SECRET_KEY` no hay cobro real posible en
  // NINGUNO de los dos planos. El de licencia ya caía a `/demo-checkout`; el de
  // socio se quedaba sin comprar, y con él toda la mitad del producto que se
  // enseña en una demo (bono, saldo, reserva). Mismo criterio que
  // `createLicenseCheckoutSession`.
  if (isDemoModeActive()) {
    return {
      ok: true,
      url: demoMemberCheckoutUrl({ orgId, memberId, planId, centerId, soldByUserId: soldByUserId ?? null, returnPath }),
    };
  }

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  const priceResult = await ensureStripePrice(orgId, planId);
  if (!priceResult.ok) return { ok: false, error: priceResult.error };

  // El cliente de Stripe del socio vive en la cuenta conectada del gimnasio: si
  // no existe aún, o si el gimnasio reconectó otra cuenta, hay que crear uno
  // nuevo ahí (el de la cuenta anterior no es válido en la nueva).
  let stripeCustomerId = member.stripeCustomerId;
  if (!stripeCustomerId || member.stripeAccountId !== accountId) {
    const customer = await stripe.customers.create(
      { email: member.email, name: `${member.firstName} ${member.lastName}` },
      { stripeAccount: accountId, idempotencyKey: customerKey(orgId, member.id) }
    );
    stripeCustomerId = customer.id;
    await prisma.member.update({ where: { id: member.id }, data: { stripeCustomerId, stripeAccountId: accountId } });
  }

  const { mode } = resolveCheckoutMode(plan.type);
  const recurring = mode === "subscription";
  // "landing" (checkout público anónimo, sin sesión) no tiene ni /billing ni
  // /portal/membresia a los que volver: aterriza en una confirmación pública
  // genérica, igual que el checkout anónimo de organizaciones vuelve a
  // /activar en vez de a un panel (platform-billing.ts). "portal" (F6) vuelve
  // a /portal/membresia (hero + renovar/ampliar, fusión de las antiguas
  // /portal/plan y /portal/comprar). Se resuelve arriba, porque el checkout de
  // demostración (HU-ST-11) también necesita saber a dónde volver.

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode,
      customer: stripeCustomerId,
      line_items: [{ price: priceResult.priceId, quantity: 1 }],
      // HU-ST-09/D-S2: `payment_method_types` NO se fija. Fijarlo a mano dejaba
      // fuera Bizum, Link y los wallets (Apple Pay, Google Pay) y, peor, hacía
      // fallar el checkout entero si alguno de los métodos listados no estaba
      // activo en la cuenta del gimnasio. Omitiéndolo, Stripe ofrece los que ese
      // gimnasio tenga habilitados —cuenta Standard, D-S1: los activa él— y
      // filtra por capacidad: en `mode:"subscription"` Bizum no aparece porque
      // no admite recurrencia.
      success_url: `${publicOrigin()}${returnPath}?checkout=success`,
      cancel_url: `${publicOrigin()}${returnPath}?checkout=cancelled`,
      metadata: { orgId, memberId, planId, centerId, ...(soldByUserId ? { soldByUserId } : {}) },
      // Stripe copia este metadata a la Subscription resultante (no el del
      // checkout.session), que es donde lo lee el webhook al recibir
      // `customer.subscription.created` para reconstruir el contexto sin adivinar.
      ...(recurring ? { subscription_data: { metadata: { orgId, memberId, planId, centerId } } } : {}),
    },
    { stripeAccount: accountId, idempotencyKey: memberCheckoutKey(orgId, memberId, planId) }
  );

  if (!checkoutSession.url) return { ok: false, error: "Stripe no devolvió una URL de checkout." };

  // Puntual: el Payment PENDING se crea aquí, igual que hacía siempre
  // stripe-checkout.ts, y el webhook lo concilia a PAID/FAILED. Recurrente: no
  // se crea nada aquí — lo crea el webhook al recibir `invoice.paid`, para no
  // dejar un Payment fantasma si el socio nunca llega a completar el pago.
  if (!recurring) {
    await recordPendingCheckoutPayment({
      orgId,
      memberId,
      amountCents: plan.priceCents,
      checkoutSessionId: checkoutSession.id,
      soldByUserId: soldByUserId ?? null,
      planName: plan.name,
    });
  }

  return { ok: true, url: checkoutSession.url };
}

/**
 * HU-ST-04 · El `Payment` PENDING del bono puntual, sin duplicar.
 *
 * La clave de idempotencia hace que un segundo intento dentro de la ventana de
 * 10 minutos reciba de Stripe LA MISMA sesión de checkout; esta función cierra
 * el lado local: `stripeCheckoutSessionId` es único en el schema, así que el
 * `upsert` deja el reintento en no-op en vez de reventar con una violación de
 * unicidad que el call site traduciría a "no se pudo cobrar" — con el cobro ya
 * abierto en Stripe.
 */
export async function recordPendingCheckoutPayment(params: {
  orgId: string;
  memberId: string;
  amountCents: number;
  checkoutSessionId: string;
  soldByUserId: string | null;
  planName: string;
}): Promise<void> {
  await prisma.payment.upsert({
    where: { stripeCheckoutSessionId: params.checkoutSessionId },
    update: {},
    create: {
      orgId: params.orgId,
      memberId: params.memberId,
      amountCents: params.amountCents,
      method: "STRIPE",
      status: "PENDING",
      date: new Date(),
      stripeCheckoutSessionId: params.checkoutSessionId,
      soldByUserId: params.soldByUserId,
      notes: `Checkout Stripe — ${params.planName}`,
    },
  });
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

  const plan = await prisma.membershipPlan.findFirst({
    where: { id: planId, orgId },
    select: { id: true, type: true, active: true },
  });
  if (!plan) return { ok: false, error: "Plan no encontrado." };
  if (!plan.active) return { ok: false, error: PLAN_ARCHIVED_ERROR };

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { stripe, accountId } = resolved;

  const priceResult = await ensureStripePrice(orgId, planId);
  if (!priceResult.ok) return { ok: false, error: priceResult.error };

  const recurring = resolveCheckoutMode(plan.type).mode === "subscription";
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
      // Mismo criterio que `createMemberCheckout` (HU-ST-09/D-S2): los métodos
      // los decide la cuenta conectada, no una lista escrita a mano aquí.
      success_url: `${publicOrigin()}/hazte-socio/gracias?checkout=success`,
      cancel_url: `${publicOrigin()}/hazte-socio/gracias?checkout=cancelled`,
      metadata,
      // El Member no existe todavía cuando se crea este checkout, así que el
      // fallback de `reconcileMemberSubscriptionUpserted` por `metadata.memberId`
      // no puede servir aquí: se le pasa `prospectEmail` para que no confunda
      // esto con una suscripción huérfana, y quede en no-op hasta que
      // `checkout.session.completed` cree el Member y enganche
      // `stripeSubscriptionId` a mano (ver `provisionMemberFromLandingCheckout`).
      ...(recurring ? { subscription_data: { metadata: { orgId, centerId, planId, prospectEmail: email } } } : {}),
    },
    { stripeAccount: accountId, idempotencyKey: prospectCheckoutKey(orgId, email, planId) }
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
    { customer: member.stripeCustomerId, return_url: `${publicOrigin()}/portal/membresia` },
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
    // `sessionsIncluded` NO es opcional aquí: sin él, un plan con sesiones
    // incluidas comprado por Stripe quedaba con `sessionsRemaining` null, que
    // `bonoUsage` interpreta como ILIMITADO (E4-30).
    prisma.membershipPlan.findFirst({
      where: { id: meta.planId, orgId },
      select: { id: true, priceCents: true, sessionsIncluded: true },
    }),
  ]);
  if (!member || !plan) return;

  const startDate = item?.current_period_start ? new Date(item.current_period_start * 1000) : new Date();

  await createSubscriptionFromPlan(prisma, {
    memberId: member.id,
    plan,
    // El checkout de socio no pide centro (el plan MONTHLY/ONLINE es de
    // organización, no de un centro concreto): arranca en el centro habitual
    // del socio, igual que cualquier bono se puede reasignar luego a mano si
    // hiciera falta.
    centerId: member.primaryCenterId,
    startDate,
    endDate,
    status,
    stripeSubscriptionId: subscription.id,
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
export type ReconcileResult = { ok: true } | { ok: false; retry: boolean; error: string };

export async function reconcileMemberInvoicePaid(orgId: string, invoice: Stripe.Invoice): Promise<ReconcileResult> {
  if (!invoice.id) return { ok: true };
  const already = await prisma.payment.findUnique({
    where: { stripeInvoiceId: invoice.id },
    select: { id: true, status: true },
  });
  // Solo una fila YA COBRADA significa reentrega del mismo evento. Una fila en
  // FAILED es lo contrario: el dunning de Stripe reintenta LA MISMA factura en
  // vez de emitir una nueva, así que este `invoice.paid` es el cobro que por
  // fin ha entrado. Salir aquí dejaba al socio pagando y marcado como moroso
  // para siempre, con el recibo en FAILED y la suscripción sin reactivar.
  if (already?.status === "PAID") return { ok: true };

  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return { ok: true };

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: { id: true, memberId: true, member: { select: { orgId: true, state: true } } },
  });
  // Stripe no garantiza el orden de entrega: `invoice.paid` puede llegar antes
  // que el `customer.subscription.created` que crea esta fila localmente. Sin
  // distinguir este caso de un aislamiento real, el evento se daba por
  // resuelto (200) y Stripe no volvía a intentarlo — el primer recibo de una
  // suscripción nueva podía desaparecer para siempre si llegaban en ese orden.
  if (!subscription) {
    return { ok: false, retry: true, error: `Suscripción ${stripeSubscriptionId} aún no existe localmente.` };
  }
  if (subscription.member.orgId !== orgId) return { ok: true }; // aislamiento: no es de esta org, no es un fallo

  const periodEnd = resolveInvoicePeriodEnd(invoice);

  if (already) {
    // El recibo ya existe del intento fallido: se actualiza en vez de crear un
    // segundo, que además chocaría con la unicidad de `stripeInvoiceId`.
    await prisma.payment.update({
      where: { id: already.id },
      data: {
        status: "PAID",
        amountCents: invoice.amount_paid,
        date: new Date(),
        notes: "Factura recurrente Stripe (cobrada tras un intento fallido)",
      },
    });
  } else {
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
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE", ...(periodEnd ? { endDate: periodEnd } : {}) },
  });

  if (subscription.member.state === "DELINQUENT") {
    await prisma.member.update({ where: { id: subscription.memberId }, data: { state: "ACTIVE" } });
  }

  // El aviso a recepción lo abrió `reconcileMemberInvoicePaymentFailed` con esta
  // misma clave. Cobrado el recibo ya no hay nada que revisar, y dejarlo abierto
  // manda a alguien a perseguir a un socio que está al corriente.
  await prisma.notification.updateMany({
    where: { orgId, entityType: "Member", entityId: subscription.memberId, kind: "ALERT", resolvedAt: null },
    data: { resolvedAt: new Date() },
  });

  return { ok: true };
}

/** `invoice.payment_failed`: marca al socio moroso y avisa a recepción/dirección — idempotente por `Payment.stripeInvoiceId`. */
/**
 * Registro de envío del aviso de impago. Va en `AuditLog` (append-only, no
 * exige cuenta de usuario) y no en el propio `Payment`, porque la fila de pago
 * se actualiza en cada reintento y no sirve de marca de "ya avisado".
 *
 * La clave es la FACTURA, no el socio: Stripe reintenta la misma factura varias
 * veces en un ciclo de dunning, y el socio debe recibir un aviso por cobro
 * fallido, no uno por reintento.
 */
const DUNNING_ENTITY = "DunningNotice";
const DUNNING_SENT_ACTION = "DUNNING_NOTICE_SENT";

async function sendDunningNoticeOnce(
  orgId: string,
  memberId: string,
  invoiceId: string,
  amountCents: number
): Promise<void> {
  const already = await prisma.auditLog.findFirst({
    where: { entityType: DUNNING_ENTITY, entityId: invoiceId },
    select: { id: true },
  });
  if (already) return;

  const [org, member] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        firstName: true,
        email: true,
        user: { select: { email: true } },
        primaryCenter: { select: { address: true } },
        subscriptions: {
          where: { status: { in: ["ACTIVE", "FROZEN"] }, plan: { type: { in: ["MONTHLY", "ONLINE"] } } },
          orderBy: { startDate: "desc" },
          take: 1,
          select: { plan: { select: { name: true } } },
        },
      },
    }),
  ]);
  const to = member?.user?.email ?? member?.email;
  if (!member || !to) return;

  // Se registra ANTES de enviar: si el correo falla, el socio se queda sin
  // aviso de ESTA factura, que es preferible a recibir uno por cada reintento
  // del banco. Recepción lo ve igual en la lista de morosos.
  await prisma.auditLog.create({
    data: {
      orgId,
      action: DUNNING_SENT_ACTION,
      entityType: DUNNING_ENTITY,
      entityId: invoiceId,
      memberId,
      metadata: { amountCents },
    },
  });

  const brandName = org?.name ?? "Training Zone";
  // Correo de servicio: NO lleva `unsubscribeUrl`. Un socio no puede darse de
  // baja de enterarse de que su cuota no se ha cobrado — sin este aviso pierde
  // el acceso sin saber por qué. El pie sí enlaza sus preferencias.
  const footer = memberEmailFooterLinks(memberId);
  void sendMail({
    to,
    fromName: brandName,
    subject: "No hemos podido cobrar tu cuota",
    html: renderPaymentFailedEmail({
      memberFirstName: member.firstName,
      brandName,
      brandLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      amountLabel: new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(amountCents / 100),
      portalUrl: memberBillingUrlFor(generateMemberDunningToken(memberId)),
      planName: member.subscriptions[0]?.plan.name,
      postalAddress: member.primaryCenter.address ?? undefined,
      prefsToken: footer.token,
    }),
  });
}

export async function reconcileMemberInvoicePaymentFailed(orgId: string, invoice: Stripe.Invoice): Promise<ReconcileResult> {
  if (!invoice.id) return { ok: true };

  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) return { ok: true };

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: {
      id: true,
      memberId: true,
      member: { select: { orgId: true, firstName: true, lastName: true } },
    },
  });
  // Mismo motivo que en `reconcileMemberInvoicePaid`: sin la fila local
  // todavía (orden de entrega no garantizado por Stripe), es retryable, no un
  // no-op.
  if (!subscription) {
    return { ok: false, retry: true, error: `Suscripción ${stripeSubscriptionId} aún no existe localmente.` };
  }
  if (subscription.member.orgId !== orgId) return { ok: true }; // aislamiento: no es de esta org, no es un fallo

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

  // El socio se entera antes que nadie y con el enlace que lo arregla. Hasta
  // ahora el impago solo generaba un aviso interno: alguien tenía que llamarlo,
  // y mientras tanto el cobro seguía sin entrar.
  await sendDunningNoticeOnce(orgId, subscription.memberId, invoice.id, invoice.amount_due ?? 0);

  // Aviso a recepción: reutiliza el motor de notificaciones de F10
  // (lib/notifications.ts), con el mismo grupo de roles que ya puede cobrar a
  // socios (billing/actions.ts) — createNotificationOnce evita duplicar el
  // aviso mientras la factura siga sin resolverse.
  const recipients = await prisma.user.findMany({
    where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR", "RECEPTION"] }, deactivatedAt: null },
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

  return { ok: true };
}
