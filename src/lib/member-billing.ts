import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { createPaymentWithReceipt } from "@/lib/payments";
import { Prisma, type PlanType, type SubscriptionStatus } from "@prisma/client";
import { createSubscriptionFromPlan } from "@/lib/subscriptions";
// STR-01: la recarga de sesiones de la renovación, en la transacción del cobro.
import { refillOnRenewal } from "@/lib/stripe-renewal";
import { publicOrigin } from "@/lib/site";
import { isCenterInScope, type ScopedUser } from "@/lib/center-scope";
// HU-ST-02: la resolución del id de suscripción de una factura es la misma para
// los dos planos y vive en un solo sitio desde que el plano 1 se quedó con el
// shape legado.
import { resolveInvoiceChargeId, resolveInvoicePeriodEnd, resolveInvoiceSubscriptionId } from "@/lib/stripe-invoice";
// HU-ST-23 (P4): punto de enganche del desglose del cobro. Hoy no hace nada.
import { recordBalanceBreakdown } from "@/lib/stripe-balance";
// HU-ST-27 (petición de P5): el descuento aplicado, en el Payment de la cuota.
import { recordInvoiceDiscount } from "@/lib/stripe-coupons";
import { isDemoModeActive } from "@/lib/platform-plans";
import { demoMemberCheckoutUrl } from "@/lib/demo-member-checkout";
import { isRecurring } from "@/lib/plan-recurrence";
// HU-ST-04/RB-PAGO-022: ninguna creación contra Stripe sale sin clave de
// idempotencia. El patrón y el registro de claves están en el módulo.
import {
  customerKey,
  lazyProductKey,
  memberCheckoutKey,
  type MemberCheckoutSource,
  priceKey,
  prospectCheckoutKey,
} from "@/lib/stripe-idempotency";
// HU-ST-12/RB-PAGO-025: el freno de "cobro asíncrono en vuelo". Un adeudo SEPA
// tarda días en liquidar y Stripe da la suscripción por activa mucho antes.
import { holdAsyncSubscriptionStatus, isAwaitingAsyncSettlement, releaseAsyncHold } from "@/lib/stripe-mandate";
// HU-ST-12/HU-ST-18: abrir y cerrar la morosidad es UNA puerta, compartida por
// las cuatro vías por las que se entra (factura fallida, adeudo asíncrono
// fallido, devolución bancaria, contracargo).
import {
  cancelAfterRetriesExhausted,
  closeDelinquency,
  openDelinquency,
  retriesExhausted,
} from "@/lib/stripe-dunning";

export type MemberCheckoutErrorCode = "ALREADY_SUBSCRIBED";

export type MemberCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: MemberCheckoutErrorCode };

/** STR-02: mismo mensaje en todas las puertas de venta. */
export const ALREADY_SUBSCRIBED_ERROR =
  "Ya tienes una cuota mensual activa. Se renueva sola cada mes: no hace falta volver a pagarla.";

/**
 * STR-02 · Estados en los que una suscripción recurrente sigue viva en Stripe y
 * volverá a cobrar: la activa, la que espera a que liquide un adeudo SEPA y la
 * congelada (con `pause_collection` Stripe no la cancela, solo deja de cobrar).
 */
const LIVE_RECURRING_STATUSES: SubscriptionStatus[] = ["ACTIVE", "PENDING_CONFIRMATION", "PAUSED"];

// F5: la regla de recurrencia vive en `plan-recurrence.ts` (ver allí por qué), y
// se sigue reexportando desde aquí: es donde la buscan todos los call sites.
export { isRecurring } from "@/lib/plan-recurrence";

/** STR-06: el nombre de cada puerta en la clave de idempotencia del checkout. */
const CHECKOUT_SOURCE_BY_ORIGIN = {
  staff: "reception",
  portal: "portal",
  mobile: "mobile",
  landing: "public",
} as const satisfies Record<string, MemberCheckoutSource>;

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
  // STR-06 · Clave propia (`lazyProductKey`), no la del catálogo: los parámetros
  // son otros y Stripe rechaza reutilizar una clave con parámetros distintos.
  // TODO(P5): cuando stripe-catalog.ts exporte `ensurePlanPriceForAccount`,
  // delegar en ella el Product y el Price y borrar este camino, para que haya
  // un solo creador del espejo.
  const productId =
    accountMatches && plan.stripeProductId
      ? plan.stripeProductId
      : (
          await stripe.products.create(
            { name: plan.name },
            { stripeAccount: accountId, idempotencyKey: lazyProductKey(orgId, plan.id) }
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
  // "mobile" (STR-06): la app nativa. Vuelve al mismo sitio que "portal", pero
  // es otra puerta y lleva su propia clave de idempotencia.
  origin: "staff" | "portal" | "landing" | "mobile";
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

  // STR-02 · "Renovar" en el portal abría otro checkout recurrente aunque la
  // cuota ya se renovara sola, y el socio acababa con dos suscripciones en
  // Stripe cobrándole dos veces al mes. Va aquí, antes del modo demo y de la
  // pasarela, porque es la puerta común de recepción, portal, landing y móvil.
  if (isRecurring(plan.type)) {
    const live = await prisma.subscription.findFirst({
      where: { memberId: member.id, stripeSubscriptionId: { not: null }, status: { in: LIVE_RECURRING_STATUSES } },
      select: { id: true },
    });
    if (live) return { ok: false, error: ALREADY_SUBSCRIBED_ERROR, code: "ALREADY_SUBSCRIBED" };
  }

  const centerId = params.centerId ?? member.primaryCenterId;
  const returnPath =
    origin === "portal" || origin === "mobile" ? "/portal/membresia" : origin === "landing" ? "/hazte-socio/gracias" : "/billing";

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
      // HU-ST-27 (petición de P5): sin esto Stripe no pinta la casilla del
      // código y el cupón del gimnasio es inalcanzable. Excluyente con
      // `discounts` (descuento impuesto desde Apta), que la historia no pide.
      allow_promotion_codes: true,
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
    {
      stripeAccount: accountId,
      idempotencyKey: memberCheckoutKey(orgId, memberId, planId, CHECKOUT_SOURCE_BY_ORIGIN[origin], centerId),
    }
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
 * HU-ST-29 §5.2 · Con qué centro se atribuye una venta de la landing pública
 * (`/hazte-socio/[orgSlug]/[centerSlug]`) cuando el email ya es de un socio.
 *
 * Esa ruta es **pública y anónima**: nadie ha demostrado ser el socio cuyo email
 * se escribe en el formulario, y el centro venía del segmento de la URL sin
 * comprobar que tuviera relación alguna con él. Cualquiera que conozca el email
 * de un socio podía, por tanto, provocar una venta atribuida al centro
 * equivocado — y con una cuenta de Stripe por centro (§4 de la HU) eso además
 * reasignaría en silencio su identidad de facturación (`stripeCustomerId`) a la
 * cuenta de un centro ajeno, porque `createMemberCheckout` recrea el cliente en
 * cuanto la cuenta conectada no coincide.
 *
 * La regla, deliberadamente conservadora: el centro de la URL solo vale si el
 * socio YA tiene relación con él —es su centro habitual, o tiene allí algún
 * bono—. Si no, la venta cae a su propio centro habitual, que es el patrón que
 * ya siguen los checkouts móviles (§7.4): el centro sale del registro del socio,
 * nunca de un parámetro que manda el cliente.
 *
 * No se rechaza la compra: un socio que cambia de centro es un caso legítimo y
 * frecuente, y RB-AGENDA-003 admite bonos en varios centros de la organización a
 * la vez. Lo que no puede es decidirlo un anónimo desde una URL.
 */
export async function resolveExistingMemberCheckoutCenter(params: {
  memberId: string;
  primaryCenterId: string;
  requestedCenterId: string;
}): Promise<string> {
  const { memberId, primaryCenterId, requestedCenterId } = params;
  if (requestedCenterId === primaryCenterId) return requestedCenterId;

  // `memberId` ya viene acotado por organización desde el llamante, así que
  // acotar por socio basta para que el bono también lo esté.
  const bonoEnEseCentro = await prisma.subscription.findFirst({
    where: { memberId, centerId: requestedCenterId },
    select: { id: true },
  });
  return bonoEnEseCentro ? requestedCenterId : primaryCenterId;
}

/**
 * STR-07 · Centro al que se atribuye una venta de recepción.
 *
 * `createStripeCheckoutAction` no pasaba centro y todo caía en el habitual del
 * socio: con dos centros, lo que recepción de B vendía en su mostrador aparecía
 * en la caja de A. El centro sale, por este orden:
 *
 *   1. del que elige quien vende, si es de su organización y de su ámbito
 *      (`isCenterInScope`); si no lo es, se rechaza — nunca se cambia en
 *      silencio por otro;
 *   2. del centro base de quien vende (donde está el mostrador);
 *   3. de ninguno: `undefined` deja que `createMemberCheckout` use el centro
 *      habitual del socio, como hasta ahora (dirección de organización sin
 *      centro base).
 */
export async function resolveStaffCheckoutCenter(
  user: ScopedUser,
  requestedCenterId: string | null
): Promise<{ ok: true; centerId: string | undefined } | { ok: false }> {
  const candidate = requestedCenterId || user.centerId;
  if (!candidate) return { ok: true, centerId: undefined };

  const center = await prisma.center.findFirst({ where: { id: candidate, orgId: user.orgId }, select: { id: true } });
  const allowed = center != null && (await isCenterInScope(user, center.id));
  if (allowed) return { ok: true, centerId: candidate };
  // El centro base de la sesión fuera de ámbito no es una elección de nadie:
  // no bloquea la venta, cae al habitual del socio.
  if (!requestedCenterId) return { ok: true, centerId: undefined };
  // El mensaje lo pone la acción (`CENTER_OUT_OF_SCOPE`, guard.ts).
  return { ok: false };
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
      // HU-ST-27, igual que en `createMemberCheckout`: es la puerta donde más
      // sentido tiene un código de captación.
      allow_promotion_codes: true,
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

/**
 * STR-04 · Una congelación del socio es un `pause_collection` en Stripe, y
 * durante ella Stripe mantiene `status: "active"`: solo deja de cobrar. Con el
 * mapeo a secas, el primer `customer.subscription.updated` tras congelar
 * devolvía la cuota a ACTIVE y el socio seguía reservando sin pagar. Solo se
 * convierte lo que habría sido ACTIVE: un cobro fallido o una baja mandan.
 */
function applyPauseCollection<T extends SubscriptionStatus>(
  status: T,
  pauseCollection: Stripe.Subscription.PauseCollection | null | undefined
): T | "PAUSED" {
  return pauseCollection != null && status === "ACTIVE" ? "PAUSED" : status;
}

/**
 * STR-05 · Las bajas y las pausas que el socio pide en el Billing Portal de
 * Stripe solo llegaban como `status`, y ni la ficha ni el portal sabían que la
 * cuota tenía fecha de fin o de vuelta.
 *
 * Solo se BORRA lo que vino de Stripe: recepción puede programar una baja
 * (`scheduleCancellation`) o congelar (FROZEN + `pauseUntil`) solo en local, y
 * cualquier `customer.subscription.updated` posterior —una renovación, un
 * cambio de tarjeta— la habría borrado. Una baja se reconoce como de Stripe si
 * coincide con su fin de periodo (`cancel_at_period_end`, que es lo que ofrecen
 * el Billing Portal y el portal propio); una pausa, por el estado PAUSED, que
 * solo escribe este reconciliador.
 */
function syncCancellationAndPause(
  subscription: Stripe.Subscription,
  existing: { status: SubscriptionStatus; cancelAt: Date | null; pauseUntil: Date | null },
  periodEnd: Date | undefined
): { cancelAt?: Date | null; pauseUntil?: Date | null } {
  const data: { cancelAt?: Date | null; pauseUntil?: Date | null } = {};

  const stripeCancelAt = subscription.cancel_at
    ? new Date(subscription.cancel_at * 1000)
    : subscription.cancel_at_period_end
      ? (periodEnd ?? null)
      : null;
  if (stripeCancelAt) {
    data.cancelAt = stripeCancelAt;
  } else if (existing.cancelAt && periodEnd && existing.cancelAt.getTime() === periodEnd.getTime()) {
    data.cancelAt = null;
  }

  const pause = subscription.pause_collection;
  if (pause) {
    // `resumes_at` null = congelación indefinida, igual que en el schema.
    data.pauseUntil = pause.resumes_at ? new Date(pause.resumes_at * 1000) : null;
  } else if (existing.status === "PAUSED" && existing.pauseUntil) {
    data.pauseUntil = null;
  }

  return data;
}

/** `customer.subscription.created` / `.updated`. */
export async function reconcileMemberSubscriptionUpserted(orgId: string, subscription: Stripe.Subscription) {
  // HU-ST-12/RB-PAGO-025 · Con un adeudo directo en vuelo, Stripe manda esta
  // suscripción como `active` DÍAS antes de que el dinero se mueva. Abrir el
  // acceso con ese estado es exactamente lo que la regla prohíbe, así que se
  // frena en PENDING_CONFIRMATION hasta que llegue el desenlace del cobro
  // (`async_payment_succeeded` o `invoice.paid`).
  const awaiting = await isAwaitingAsyncSettlement(subscription.id);
  const status = applyPauseCollection(
    holdAsyncSubscriptionStatus(mapStripeSubscriptionStatus(subscription.status), awaiting),
    subscription.pause_collection
  );
  const item = subscription.items.data[0];
  const endDate = item?.current_period_end ? new Date(item.current_period_end * 1000) : undefined;

  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true, status: true, cancelAt: true, pauseUntil: true, member: { select: { orgId: true } } },
  });

  if (existing) {
    if (existing.member.orgId !== orgId) return; // aislamiento: la suscripción no es de esta org
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status,
        ...(endDate ? { endDate } : {}),
        ...syncCancellationAndPause(subscription, existing, endDate),
      },
    });
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

  // STR-03 · El centro de la venta viaja en `subscription_data.metadata.centerId`
  // (lo pone `createMemberCheckout`, y en recepción es el centro elegido). Se
  // ignoraba y la cuota caía siempre en el centro habitual, así que la caja de
  // un segundo centro nunca veía sus cuotas. El webhook no tiene usuario con el
  // que aplicar `isCenterInScope`: la frontera aquí es la organización del
  // evento, y un centro que no sea de ella se descarta.
  const centerId = await resolveSubscriptionCenterId(orgId, meta.centerId, member.primaryCenterId);

  const startDate = item?.current_period_start ? new Date(item.current_period_start * 1000) : new Date();

  await createSubscriptionFromPlan(prisma, {
    memberId: member.id,
    plan,
    centerId,
    startDate,
    endDate,
    status,
    stripeSubscriptionId: subscription.id,
  });
}

/** STR-03: el centro del metadata si es de la organización; si no, el habitual del socio. */
async function resolveSubscriptionCenterId(
  orgId: string,
  requestedCenterId: string | undefined,
  primaryCenterId: string
): Promise<string> {
  if (!requestedCenterId || requestedCenterId === primaryCenterId) return primaryCenterId;
  const center = await prisma.center.findFirst({ where: { id: requestedCenterId, orgId }, select: { id: true } });
  return center ? center.id : primaryCenterId;
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
  const invoiceId = invoice.id;
  const already = await prisma.payment.findUnique({
    where: { stripeInvoiceId: invoiceId },
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

  // STR-01 · El cobro, la recarga de sesiones de la renovación y el estado de
  // la suscripción van en UNA transacción: un `Payment` PAID sin recarga deja al
  // socio pagando una cuota sin sesiones, y una recarga sin `Payment` hace que
  // la reentrega del evento (que ya no ve el cobro) recargue otra vez.
  //
  // Dos entregas concurrentes del mismo evento chocan en la unicidad de
  // `stripeInvoiceId`: la segunda transacción se deshace entera (recarga
  // incluida) y su reintento ve el `Payment` PAID y sale.
  const paymentId = await withUniqueRetry(async (attempt) => {
    const current = attempt === 0 ? already : await prisma.payment.findUnique({
      where: { stripeInvoiceId: invoiceId },
      select: { id: true, status: true },
    });
    if (current?.status === "PAID") return null;

    return prisma.$transaction(async (tx) => {
      // HU-ST-23: el desglose necesita saber SOBRE QUÉ cobro se apunta, y las
      // dos ramas de abajo lo conocen por vías distintas.
      let id: string;
      if (current) {
        // El recibo ya existe del intento fallido: se actualiza en vez de crear
        // un segundo, que además chocaría con la unicidad de `stripeInvoiceId`.
        await tx.payment.update({
          where: { id: current.id },
          data: {
            status: "PAID",
            amountCents: invoice.amount_paid,
            date: new Date(),
            notes: "Factura recurrente Stripe (cobrada tras un intento fallido)",
          },
        });
        id = current.id;
      } else {
        id = (
          await createPaymentWithReceiptInTx(tx, attempt, {
            orgId,
            memberId: subscription.memberId,
            subscriptionId: subscription.id,
            amountCents: invoice.amount_paid,
            method: "STRIPE",
            status: "PAID",
            date: new Date(),
            stripeInvoiceId: invoiceId,
            notes: "Factura recurrente Stripe",
          })
        ).id;
      }

      // Solo en renovación (`subscription_cycle`, y `subscription_update` del
      // adelanto de P4); idempotente por factura. Deja también el `endDate`.
      await refillOnRenewal(tx, {
        subscriptionId: subscription.id,
        invoiceId,
        billingReason: invoice.billing_reason,
        periodEnd,
      });

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "ACTIVE", ...(periodEnd ? { endDate: periodEnd } : {}) },
      });
      return id;
    });
  });
  // Otra entrega concurrente ya lo concilió entero.
  if (!paymentId) return { ok: true };

  // HU-ST-27 (petición de P5): el descuento de la factura, sobre el `Payment`
  // que acaba de escribirse — es el punto común de las dos ramas de arriba
  // (recibo que ya existía de un intento fallido, y recibo nuevo).
  await recordInvoiceDiscount(orgId, invoice, paymentId);

  // HU-ST-23 (P4) · Punto de enganche del desglose bruto/comisión/neto. Hoy no
  // hace nada y NO puede lanzar: es un apunte contable colgado del camino del
  // cobro, y tumbar aquí haría que Stripe reintentase un `invoice.paid` que ya
  // estaba bien. El desglose se reconstruye después; el cobro no.
  await recordBalanceBreakdown(paymentId, resolveInvoiceChargeId(invoice));

  // HU-ST-12: `invoice.paid` es el otro desenlace posible de un adeudo directo
  // en vuelo (el primero es `checkout.session.async_payment_succeeded`). El
  // dinero ya ha entrado, así que el freno de RB-PAGO-025 se levanta aquí.
  if (stripeSubscriptionId) await releaseAsyncHold(orgId, stripeSubscriptionId, true);

  // El aviso a recepción lo abrió `reconcileMemberInvoicePaymentFailed`. Cobrado
  // el recibo ya no hay nada que revisar, y dejarlo abierto manda a alguien a
  // perseguir a un socio que está al corriente. Con él se para el reloj del
  // periodo de gracia (HU-ST-18).
  await closeDelinquency(orgId, subscription.memberId);

  return { ok: true };
}

/**
 * `invoice.payment_failed`: marca al socio moroso y avisa a recepción/dirección
 * — idempotente por `Payment.stripeInvoiceId`.
 *
 * El efecto de morosidad (estado del socio, reloj del periodo de gracia, aviso
 * al socio y tarea de recepción) vive en `stripe-dunning.ts`: es el mismo por
 * las cuatro puertas por las que se entra en impago —factura fallida, adeudo
 * SEPA que no liquida, devolución bancaria y contracargo—, y tenerlo escrito
 * aquí dentro obligaba a copiarlo en las otras tres.
 */
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

  // El socio se entera antes que nadie y con el enlace que lo arregla, el reloj
  // del periodo de gracia arranca (D-S5) y recepción recibe su tarea. Todo ello
  // es `openDelinquency`: la única puerta por la que se escribe DELINQUENT.
  await openDelinquency({
    orgId,
    memberId: subscription.memberId,
    noticeKey: invoice.id,
    amountCents: invoice.amount_due ?? 0,
    reason: "INVOICE_FAILED",
  });

  // HU-ST-18/D-S6 · Agotados los reintentos, se cancela. No se espera a que lo
  // haga el Dashboard de Stripe: los dos lados se fijan en `cancel` a propósito
  // para que coincidan, y confiar solo en la configuración remota deja al socio
  // de baja en un sitio y vivo en el otro.
  if (retriesExhausted(invoice)) {
    await cancelAfterRetriesExhausted({
      orgId,
      memberId: subscription.memberId,
      subscriptionId: subscription.id,
      stripeSubscriptionId,
      invoiceId: invoice.id,
    });
  }

  return { ok: true };
}

/**
 * STR-01 · `createPaymentWithReceipt` (payments.ts) escribe con el cliente raíz y
 * reintenta la colisión del número de recibo DENTRO de su bucle. Dentro de una
 * transacción de Postgres eso no sirve: tras un error la transacción queda
 * abortada y cualquier sentencia siguiente falla. Aquí el número se calcula en
 * la transacción y el reintento lo hace `withUniqueRetry` con la transacción
 * entera. `attempt` desplaza el número igual que el bucle original.
 *
 * TODO(payments.ts, fuera de esta pista): exponer allí una variante con `tx` y
 * borrar esta.
 */
async function createPaymentWithReceiptInTx(
  tx: Prisma.TransactionClient,
  attempt: number,
  data: Omit<Prisma.PaymentUncheckedCreateInput, "receiptNumber">
) {
  const count = await tx.payment.count({ where: { orgId: data.orgId } });
  return tx.payment.create({ data: { ...data, receiptNumber: `TZ-${2000 + count + attempt}` } });
}

/** Reintenta una transacción que choca con una restricción de unicidad (P2002). */
async function withUniqueRetry<T>(run: (attempt: number) => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(attempt);
    } catch (e) {
      const unique = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!unique || attempt + 1 >= maxAttempts) throw e;
    }
  }
}
