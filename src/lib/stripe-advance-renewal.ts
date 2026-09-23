import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripeForOrg } from "@/lib/stripe";
import { isRecurring } from "@/lib/member-billing";

/**
 * ADV-01 · Adelantar la renovación de una cuota recurrente (plano 2).
 *
 * El socio que agota las sesiones de su cuota mensual antes de la renovación
 * puede pagar YA el mes siguiente: el cobro recurrente de Stripe pasa a ser hoy
 * y el siguiente, dentro de un periodo.
 *
 * Decisiones:
 * - **D4**: se pierde lo que queda del periodo en curso (`proration_behavior:
 *   "none"`). No hay abono de los días restantes, y la pantalla lo dice antes de
 *   confirmar.
 * - **D5**: solo con tarjeta. Un adeudo SEPA tarda días en confirmarse y el
 *   socio no tendría sus sesiones hasta entonces; con SEPA la pantalla ofrece un
 *   bono puntual.
 *
 * `payment_behavior: "pending_if_incomplete"`: si el cobro no sale (3DS,
 * tarjeta rechazada), Stripe NO aplica el cambio de ciclo — lo deja en
 * `pending_update` y el socio sigue en su periodo actual. Comprobado contra los
 * tipos del SDK de la versión fijada (`2026-07-29.dahlia`, stripe-api-version.ts):
 * `Subscription.PendingUpdate` lleva `billing_cycle_anchor` y `metadata`, que
 * son justo los dos campos que se envían además de `proration_behavior`. (La
 * documentación web de Stripe no era accesible desde el entorno de desarrollo.)
 *
 * **Aquí NO se toca `sessionsRemaining`**: la recarga la hace el webhook
 * `invoice.paid` con `billing_reason: "subscription_update"` (P2,
 * `refillOnRenewal`), que es quien escribe `SessionLedger`. Si se recargara
 * aquí, un 3DS abandonado dejaría sesiones regaladas sin cobro detrás.
 *
 * Paridad móvil (`POST /api/mobile/v1/portal/billing/advance`): fuera de
 * alcance de esta pista. Cuando se haga, debe llamar a esta misma función.
 */

export const ADVANCE_RENEWAL_AUDIT_ACTION = "MEMBER_ADVANCE_RENEWAL";

export type AdvanceRenewalErrorCode =
  /** No existe, o no es de este socio / esta organización. No se distingue a propósito. */
  | "NOT_FOUND"
  | "NOT_RECURRING"
  | "NOT_ACTIVE"
  | "NO_STRIPE_SUBSCRIPTION"
  | "CANCELLATION_SCHEDULED"
  /** D5: el método de pago por defecto no es una tarjeta (p. ej. SEPA). */
  | "NOT_CARD"
  /** Ya se adelantó en este ciclo: un segundo adelanto cobraría otro mes. */
  | "ALREADY_ADVANCED"
  | "STRIPE_UNAVAILABLE"
  | "PAYMENT_FAILED"
  | "STRIPE_ERROR";

const MESSAGES: Record<AdvanceRenewalErrorCode, string> = {
  NOT_FOUND: "No se ha encontrado tu cuota.",
  NOT_RECURRING: "Solo se puede adelantar la renovación de una cuota mensual.",
  NOT_ACTIVE: "Tu cuota no está activa ahora mismo.",
  NO_STRIPE_SUBSCRIPTION: "Tu cuota no se cobra online: habla con recepción para renovarla.",
  CANCELLATION_SCHEDULED: "Tienes una baja programada: revísala antes de adelantar la renovación.",
  NOT_CARD: "Tu cuota se paga por domiciliación bancaria y no se puede adelantar. Puedes comprar un bono puntual.",
  ALREADY_ADVANCED: "Ya has adelantado la renovación de este mes.",
  STRIPE_UNAVAILABLE: "Los pagos online no están disponibles en tu centro ahora mismo.",
  PAYMENT_FAILED: "No se ha podido cobrar la tarjeta. No se ha cambiado nada de tu cuota.",
  STRIPE_ERROR: "No se ha podido adelantar la renovación. Inténtalo de nuevo en un momento.",
};

export class AdvanceRenewalError extends Error {
  readonly code: AdvanceRenewalErrorCode;
  /** Con PAYMENT_FAILED: la factura sigue abierta y puede pagarse con otra tarjeta. */
  readonly hostedInvoiceUrl: string | null;

  constructor(code: AdvanceRenewalErrorCode, hostedInvoiceUrl: string | null = null) {
    super(MESSAGES[code]);
    this.name = "AdvanceRenewalError";
    this.code = code;
    this.hostedInvoiceUrl = hostedInvoiceUrl;
  }
}

export type AdvanceRenewalInput = {
  orgId: string;
  memberId: string;
  subscriptionId: string;
  /** Para el AuditLog; el socio que pulsa el botón. */
  actorUserId?: string | null;
};

export type AdvanceRenewalResult =
  | { status: "paid"; amountCents: number | null; nextChargeAt: Date | null }
  /** 3DS: hay que mandar al socio a la factura alojada de Stripe. */
  | { status: "requires_action"; hostedInvoiceUrl: string };

export type AdvanceRenewalPreview = {
  amountCents: number;
  currency: string;
  /** Fecha del cobro siguiente si se adelanta hoy, según Stripe. */
  nextChargeAt: Date | null;
  /** Fecha del cobro que se adelanta (fin del periodo en curso), según Stripe. */
  currentPeriodEnd: Date | null;
};

type ResolvedStripe = { ok: true; stripe: Stripe; accountId: string } | { ok: false; error: string };

export type AdvanceRenewalDeps = {
  resolveStripe: (orgId: string) => Promise<ResolvedStripe>;
  now: () => Date;
};

const defaultDeps: AdvanceRenewalDeps = { resolveStripe: stripeForOrg, now: () => new Date() };

/**
 * `advance:<orgId>:<stripeSubId>:<current_period_start>:v1` — una por ciclo.
 *
 * El inicio del periodo en curso es lo que hace estable la clave: el doble clic
 * lee el mismo periodo y colisiona; un adelanto legítimo el mes siguiente ya
 * está en otro periodo (el adelanto mismo lo mueve) y no.
 */
export function advanceRenewalKey(orgId: string, stripeSubscriptionId: string, currentPeriodStart: number): string {
  return `advance:${orgId}:${stripeSubscriptionId}:${currentPeriodStart}:v1`;
}

/**
 * ¿Ya se adelantó en este ciclo? Tras un adelanto con éxito el periodo nuevo
 * empieza en el momento del cobro, que es el `advanceRenewalAt` que se dejó en
 * la metadata. Si la marca cae dentro del periodo en curso (con un minuto de
 * margen por el reloj), un segundo clic con la página sin recargar cobraría
 * otro mes con una clave nueva: se para aquí.
 */
export function advancedInCurrentPeriod(metadata: Stripe.Metadata | null | undefined, currentPeriodStart: number): boolean {
  const iso = metadata?.advanceRenewalAt;
  if (!iso) return false;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return false;
  return at >= (currentPeriodStart - 60) * 1000;
}

/** Tarjeta de la suscripción; si no tiene, la del cliente (`invoice_settings`). */
export function defaultPaymentMethodType(sub: Stripe.Subscription): string | null {
  const own = sub.default_payment_method;
  if (own && typeof own === "object") return own.type;
  const customer = sub.customer;
  if (customer && typeof customer === "object" && !("deleted" in customer && customer.deleted)) {
    const pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    if (pm && typeof pm === "object") return pm.type;
  }
  return null;
}

async function loadLocal(input: AdvanceRenewalInput) {
  const sub = await prisma.subscription.findUnique({
    where: { id: input.subscriptionId },
    select: {
      id: true,
      memberId: true,
      status: true,
      cancelAt: true,
      priceCents: true,
      stripeSubscriptionId: true,
      member: { select: { orgId: true } },
      plan: { select: { type: true, orgId: true } },
    },
  });
  // Socio y organización en la misma comprobación: el de otra org recibe lo
  // mismo que una suscripción que no existe.
  if (!sub || sub.memberId !== input.memberId || sub.member.orgId !== input.orgId || sub.plan.orgId !== input.orgId) {
    throw new AdvanceRenewalError("NOT_FOUND");
  }
  if (!isRecurring(sub.plan.type)) throw new AdvanceRenewalError("NOT_RECURRING");
  if (sub.status !== "ACTIVE") throw new AdvanceRenewalError("NOT_ACTIVE");
  if (!sub.stripeSubscriptionId) throw new AdvanceRenewalError("NO_STRIPE_SUBSCRIPTION");
  if (sub.cancelAt) throw new AdvanceRenewalError("CANCELLATION_SCHEDULED");
  return { ...sub, stripeSubscriptionId: sub.stripeSubscriptionId };
}

type Remote = { stripe: Stripe; accountId: string; sub: Stripe.Subscription; periodStart: number; periodEnd: number };

/** Precondiciones remotas: la verdad de Stripe manda sobre la copia local. */
async function loadRemote(orgId: string, stripeSubscriptionId: string, deps: AdvanceRenewalDeps): Promise<Remote> {
  const resolved = await deps.resolveStripe(orgId);
  if (!resolved.ok) throw new AdvanceRenewalError("STRIPE_UNAVAILABLE");

  let sub: Stripe.Subscription;
  try {
    sub = await resolved.stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      { expand: ["default_payment_method", "customer.invoice_settings.default_payment_method", "latest_invoice"] },
      { stripeAccount: resolved.accountId }
    );
  } catch {
    throw new AdvanceRenewalError("STRIPE_ERROR");
  }

  if (sub.status !== "active") throw new AdvanceRenewalError("NOT_ACTIVE");
  if (sub.cancel_at || sub.cancel_at_period_end) throw new AdvanceRenewalError("CANCELLATION_SCHEDULED");
  if (defaultPaymentMethodType(sub) !== "card") throw new AdvanceRenewalError("NOT_CARD");

  const item = sub.items.data[0];
  if (!item) throw new AdvanceRenewalError("STRIPE_ERROR");
  return {
    stripe: resolved.stripe,
    accountId: resolved.accountId,
    sub,
    periodStart: item.current_period_start,
    periodEnd: item.current_period_end,
  };
}

function toDate(unix: number | null | undefined): Date | null {
  return unix ? new Date(unix * 1000) : null;
}

/**
 * Lo que enseña el modal antes de confirmar: importe y nueva fecha del próximo
 * cobro, calculados POR STRIPE con los mismos parámetros del adelanto — nunca
 * en el cliente.
 */
export async function previewAdvanceRenewal(
  input: AdvanceRenewalInput,
  deps: AdvanceRenewalDeps = defaultDeps
): Promise<AdvanceRenewalPreview> {
  const local = await loadLocal(input);
  const remote = await loadRemote(input.orgId, local.stripeSubscriptionId, deps);
  if (advancedInCurrentPeriod(remote.sub.metadata, remote.periodStart)) throw new AdvanceRenewalError("ALREADY_ADVANCED");

  let preview: Stripe.Invoice;
  try {
    preview = await remote.stripe.invoices.createPreview(
      {
        subscription: remote.sub.id,
        subscription_details: { billing_cycle_anchor: "now", proration_behavior: "none" },
      },
      { stripeAccount: remote.accountId }
    );
  } catch {
    throw new AdvanceRenewalError("STRIPE_ERROR");
  }

  const line = preview.lines?.data?.[0];
  return {
    amountCents: preview.amount_due ?? local.priceCents,
    currency: preview.currency ?? "eur",
    nextChargeAt: toDate(line?.period?.end),
    currentPeriodEnd: toDate(remote.periodEnd),
  };
}

function stripeErrorType(err: unknown): string | null {
  return err && typeof err === "object" && "type" in err && typeof err.type === "string" ? err.type : null;
}

/** PaymentIntent de la factura: en dahlia vive en `invoice.payments[].payment`. */
async function invoicePaymentIntent(remote: Remote, invoice: Stripe.Invoice): Promise<Stripe.PaymentIntent | null> {
  let payments = invoice.payments?.data;
  if (!payments && invoice.id) {
    const full = await remote.stripe.invoices.retrieve(invoice.id, { expand: ["payments"] }, { stripeAccount: remote.accountId });
    payments = full.payments?.data;
  }
  const ref = payments?.find((p) => p.payment.type === "payment_intent")?.payment.payment_intent;
  if (!ref) return null;
  if (typeof ref === "object") return ref;
  return remote.stripe.paymentIntents.retrieve(ref, {}, { stripeAccount: remote.accountId });
}

/**
 * Suscripción con un cambio pendiente de cobro: o espera al 3DS, o la tarjeta
 * se rechazó. En los dos casos el ciclo NO se ha movido todavía.
 */
async function resolvePending(remote: Remote, sub: Stripe.Subscription): Promise<AdvanceRenewalResult> {
  const invoice = sub.latest_invoice;
  const inv =
    invoice && typeof invoice === "object"
      ? invoice
      : invoice
        ? await remote.stripe.invoices.retrieve(invoice, { expand: ["payments"] }, { stripeAccount: remote.accountId })
        : null;
  const hosted = inv?.hosted_invoice_url ?? null;
  const pi = inv ? await invoicePaymentIntent(remote, inv) : null;
  if (hosted && pi && (pi.status === "requires_action" || pi.status === "requires_confirmation")) {
    return { status: "requires_action", hostedInvoiceUrl: hosted };
  }
  throw new AdvanceRenewalError("PAYMENT_FAILED", hosted);
}

export async function advanceRenewal(
  input: AdvanceRenewalInput,
  deps: AdvanceRenewalDeps = defaultDeps
): Promise<AdvanceRenewalResult> {
  const local = await loadLocal(input);
  const remote = await loadRemote(input.orgId, local.stripeSubscriptionId, deps);

  // Un adelanto a medias (3DS sin completar) se retoma: se devuelve la misma
  // factura en vez de lanzar otro cambio sobre la suscripción.
  if (remote.sub.pending_update) return resolvePending(remote, remote.sub);
  if (advancedInCurrentPeriod(remote.sub.metadata, remote.periodStart)) throw new AdvanceRenewalError("ALREADY_ADVANCED");

  const key = advanceRenewalKey(input.orgId, remote.sub.id, remote.periodStart);
  const at = deps.now();

  let updated: Stripe.Subscription;
  try {
    updated = await remote.stripe.subscriptions.update(
      remote.sub.id,
      {
        billing_cycle_anchor: "now",
        proration_behavior: "none",
        payment_behavior: "pending_if_incomplete",
        metadata: { advanceRenewalAt: at.toISOString() },
        expand: ["latest_invoice.payments"],
      },
      { stripeAccount: remote.accountId, idempotencyKey: key }
    );
  } catch (err) {
    const type = stripeErrorType(err);
    if (type === "StripeCardError") throw new AdvanceRenewalError("PAYMENT_FAILED");
    // Dos clics simultáneos: misma clave, pero `advanceRenewalAt` distinto en
    // cada uno, así que Stripe rechaza el segundo en vez de repetir la
    // respuesta. El primero sigue su curso: se relee y se informa de su estado.
    if (type === "StripeIdempotencyError") {
      const again = await loadRemote(input.orgId, local.stripeSubscriptionId, deps).catch(() => null);
      if (again?.sub.pending_update) return resolvePending(again, again.sub);
      throw new AdvanceRenewalError("ALREADY_ADVANCED");
    }
    throw new AdvanceRenewalError("STRIPE_ERROR");
  }

  let result: AdvanceRenewalResult;
  if (updated.pending_update) {
    result = await resolvePending(remote, updated);
  } else {
    const invoice = typeof updated.latest_invoice === "object" ? updated.latest_invoice : null;
    result = {
      status: "paid",
      amountCents: invoice?.amount_paid ?? local.priceCents,
      nextChargeAt: toDate(updated.items.data[0]?.current_period_end),
    };
  }

  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId ?? null,
      action: ADVANCE_RENEWAL_AUDIT_ACTION,
      entityType: "Subscription",
      entityId: local.id,
      memberId: input.memberId,
      metadata: {
        stripeSubscriptionId: remote.sub.id,
        idempotencyKey: key,
        advanceRenewalAt: at.toISOString(),
        outcome: result.status,
        previousPeriodEnd: new Date(remote.periodEnd * 1000).toISOString(),
        nextChargeAt: result.status === "paid" ? (result.nextChargeAt?.toISOString() ?? null) : null,
      },
    },
  });

  return result;
}
