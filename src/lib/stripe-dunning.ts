import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { stripeForOrg } from "@/lib/stripe";
import { createNotificationOnce } from "@/lib/notifications";
import { renderPaymentFailedEmail } from "@/lib/emails/templates";
import { generateMemberDunningToken, memberBillingUrlFor } from "@/lib/email-verification";
import { memberEmailFooterLinks } from "@/lib/email-preferences-queries";
import { absoluteUrl } from "@/lib/site";
// D-S5: los días de gracia son de la ORGANIZACIÓN y se leen del servidor. Ni el
// número ni el cálculo se escriben en ningún otro sitio.
import { graceDeadline, graceWindowFor, isWithinGraceWindow } from "@/lib/billing-shared";
import { formatInstantDate, DEFAULT_TIMEZONE } from "@/lib/date-utils";
// HU-ST-19: reintentar una factura es una escritura contra Stripe, y va con
// clave de idempotencia como todas (RB-PAGO-022).
import { invoicePayKey } from "@/lib/stripe-idempotency";

/**
 * HU-ST-18 · Motor de morosidad. **PISTA P1.**
 *
 * Aquí vive todo lo que pasa cuando un cobro no entra: el socio pasa a
 * DELINQUENT, se le avisa UNA vez por factura, se abre la tarea de recepción y
 * —al agotarse el periodo de gracia de su organización (D-S5)— se le corta la
 * reserva de nuevas sesiones.
 *
 * Está en un módulo propio y no dentro de `member-billing.ts` porque hay cuatro
 * puertas distintas por las que se entra en morosidad y las cuatro tienen que
 * hacer exactamente lo mismo:
 *   · `invoice.payment_failed` (tarjeta rechazada, cuota recurrente),
 *   · `checkout.session.async_payment_failed` (el adeudo SEPA no llega a
 *     cargarse, HU-ST-12),
 *   · la devolución bancaria posterior —R-transaction— de un adeudo que YA
 *     estaba conciliado (HU-ST-12),
 *   · el contracargo de una tarjeta (HU-ST-21, P2).
 *
 * El invariante del trimestre que aquí importa: **cortar el acceso por
 * morosidad no consume ni devuelve saldo**. No se toca `sessionsRemaining` en
 * ninguna de estas rutas, así que tampoco hay asiento en `SessionLedger` que
 * escribir — el socio recupera su bono intacto en cuanto paga.
 */

/**
 * Registro de envío del aviso de impago. Va en `AuditLog` (append-only, no
 * exige cuenta de usuario) y no en el propio `Payment`, porque la fila de pago
 * se actualiza en cada reintento y no sirve de marca de "ya avisado".
 *
 * La clave es la FACTURA (o el cargo devuelto), no el socio: Stripe reintenta
 * la misma factura varias veces en un ciclo de dunning, y el socio debe recibir
 * un aviso por cobro fallido, no uno por reintento.
 */
export const DUNNING_ENTITY = "DunningNotice";
export const DUNNING_SENT_ACTION = "DUNNING_NOTICE_SENT";

/**
 * Motivo por el que se abre la morosidad. Solo cambia el texto del aviso
 * interno: el efecto sobre el socio es el mismo en los cuatro casos.
 */
export type DelinquencyReason = "INVOICE_FAILED" | "SEPA_ASYNC_FAILED" | "SEPA_RETURNED" | "DISPUTE";

const REASON_LABEL: Record<DelinquencyReason, string> = {
  INVOICE_FAILED: "Stripe no ha podido cobrar la cuota de este mes. Revisa el método de pago del socio.",
  SEPA_ASYNC_FAILED:
    "El adeudo SEPA no ha llegado a cargarse en la cuenta del socio. Revisa la domiciliación con él.",
  SEPA_RETURNED:
    "El banco ha devuelto un adeudo SEPA que ya estaba cobrado. El dinero ha salido de la cuenta del gimnasio.",
  DISPUTE: "El banco del socio ha abierto una disputa sobre un cobro. Revísalo en el Dashboard de Stripe.",
};

export async function sendDunningNoticeOnce(
  orgId: string,
  memberId: string,
  /** Clave del aviso: la factura, o el cargo cuando no hay factura detrás. */
  noticeKey: string,
  amountCents: number
): Promise<void> {
  const already = await prisma.auditLog.findFirst({
    where: { entityType: DUNNING_ENTITY, entityId: noticeKey },
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
      entityId: noticeKey,
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

/**
 * Abre (o mantiene) la morosidad de un socio: **la única puerta** por la que se
 * escribe `Member.state = DELINQUENT`.
 *
 * `delinquentSince` es lo que hace medible el periodo de gracia, y por eso solo
 * se pone si no había ya un impago abierto: los reintentos de Stripe generan
 * varios fallos sobre la misma deuda, y reiniciar el reloj en cada uno le
 * regalaba al moroso una gracia infinita.
 */
export async function openDelinquency(params: {
  orgId: string;
  memberId: string;
  /** Clave del aviso al socio (factura o cargo). Sin ella no se manda correo. */
  noticeKey?: string | null;
  amountCents: number;
  reason: DelinquencyReason;
  now?: Date;
}): Promise<void> {
  const { orgId, memberId, amountCents, reason } = params;
  const now = params.now ?? new Date();

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      delinquentSince: true,
      subscriptions: { select: { status: true } },
    },
  });
  if (!member) return;

  // HU-ST-14/HU-ST-18 · Un socio congelado VOLUNTARIAMENTE no es un moroso. En
  // Stripe una congelación es `pause_collection`, que no factura, así que este
  // caso solo aparece por una factura en vuelo justo al congelar — y marcarlo
  // moroso lo mete en la lista de recepción y le corta el acceso por algo que
  // él mismo pidió. `PAUSED` es lo que distingue congelado de impagado desde
  // que dejaron de compartir estado.
  const live = member.subscriptions.filter((s) => s.status !== "CANCELLED" && s.status !== "EXPIRED");
  if (live.length > 0 && live.every((s) => s.status === "PAUSED")) return;

  await prisma.member.update({
    where: { id: member.id },
    data: {
      state: "DELINQUENT",
      // El reloj de la gracia arranca en el PRIMER impago y no se reinicia.
      ...(member.delinquentSince ? {} : { delinquentSince: now }),
    },
  });

  if (params.noticeKey) {
    await sendDunningNoticeOnce(orgId, memberId, params.noticeKey, amountCents);
  }

  // Aviso a recepción: reutiliza el motor de notificaciones de F10
  // (lib/notifications.ts), con el mismo grupo de roles que ya puede cobrar a
  // socios (billing/actions.ts) — createNotificationOnce evita duplicar el
  // aviso mientras la factura siga sin resolverse.
  const recipients = await prisma.user.findMany({
    where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR", "RECEPTION"] }, deactivatedAt: null },
    select: { id: true },
  });
  const memberName = `${member.firstName} ${member.lastName}`;
  const title =
    reason === "SEPA_RETURNED"
      ? `${memberName}: adeudo SEPA devuelto por el banco`
      : `${memberName}: cobro recurrente fallido`;
  for (const recipient of recipients) {
    await createNotificationOnce({
      orgId,
      recipientUserId: recipient.id,
      kind: "ALERT",
      title,
      body: REASON_LABEL[reason],
      entityType: "Member",
      entityId: memberId,
    });
  }
}

/**
 * Cierra la morosidad: el cobro entró. Limpia el reloj de gracia y resuelve el
 * aviso de recepción — dejarlo abierto manda a alguien a perseguir a un socio
 * que está al corriente.
 */
export async function closeDelinquency(orgId: string, memberId: string): Promise<void> {
  await prisma.member.updateMany({
    where: { id: memberId, orgId, state: "DELINQUENT" },
    data: { state: "ACTIVE", delinquentSince: null },
  });
  // El `delinquentSince` se limpia también si el socio ya no estaba DELINQUENT
  // (recepción pudo devolverlo a ACTIVE a mano): un reloj colgado sin impago
  // abierto corta el acceso de alguien que paga.
  await prisma.member.updateMany({
    where: { id: memberId, orgId, delinquentSince: { not: null }, state: { not: "DELINQUENT" } },
    data: { delinquentSince: null },
  });

  await prisma.notification.updateMany({
    where: { orgId, entityType: "Member", entityId: memberId, kind: "ALERT", resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// El corte de acceso (HU-ST-18, decisión D-S5)
// ---------------------------------------------------------------------------
//
// `Member.state = DELINQUENT` NO cortaba nada: el motor de reservas filtra por
// `Subscription.status === "ACTIVE"`, no por el estado del socio. El moroso
// seguía reservando igual mientras su bono estuviera vivo, que es lo que hace
// el impago indoloro.
//
// El corte no es inmediato: hay un periodo de gracia —7 días naturales por
// defecto, configurable por organización entre 0 y 60— porque el primer fallo
// de cobro suele ser una tarjeta caducada y no un impago de verdad.

export type MemberDunningStatus = {
  /** ¿Hay un impago abierto? */
  delinquent: boolean;
  /** Días de gracia de ESTA organización (leídos del servidor, D-S5). */
  graceDays: number;
  /** Instante en que se corta el acceso, o `null` si no hay impago abierto. */
  deadline: Date | null;
  /** ¿Se le corta ya la reserva de nuevas sesiones? */
  blocked: boolean;
};

/**
 * Estado de morosidad de un socio, con los días de gracia de su organización ya
 * resueltos. **Es el único sitio que los lee**: ni la web ni la app llevan el
 * número escrito, porque un centro que fija 14 días seguiría cortando a los 7.
 */
export async function getMemberDunningStatus(
  memberId: string,
  now: Date = new Date()
): Promise<MemberDunningStatus | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { orgId: true, state: true, delinquentSince: true },
  });
  if (!member) return null;

  const graceDays = await graceWindowFor(member.orgId);
  const delinquent = member.state === "DELINQUENT" && member.delinquentSince != null;
  const deadline = delinquent ? graceDeadline(member.delinquentSince, graceDays) : null;

  return {
    delinquent,
    graceDays,
    deadline,
    blocked: delinquent && !isWithinGraceWindow(member.delinquentSince, graceDays, now),
  };
}

export type BookingGate = { allowed: true } | { allowed: false; reason: string };

/** El texto que ve el socio cuando el impago ya le corta el acceso. */
export function memberBlockedMessage(graceDays: number): string {
  return graceDays > 0
    ? `Tu cuota sigue sin cobrarse y el periodo de gracia de ${graceDays} ${graceDays === 1 ? "día" : "días"} ha terminado: no puedes reservar nuevas sesiones hasta que se regularice el pago. Actualiza tu método de pago desde tu cuota y el acceso vuelve al instante.`
    : "Tu cuota sigue sin cobrarse: no puedes reservar nuevas sesiones hasta que se regularice el pago. Actualiza tu método de pago desde tu cuota y el acceso vuelve al instante.";
}

/** Lo que ve recepción cuando intenta apuntar a un moroso desde el mostrador. */
export function staffBlockedMessage(memberName: string, deadline: Date | null, timezone?: string | null): string {
  const desde = deadline ? ` El periodo de gracia terminó el ${formatInstantDate(deadline, timezone || DEFAULT_TIMEZONE)}.` : "";
  return `${memberName} tiene un recibo sin pagar y el acceso cortado por morosidad.${desde} Registra el cobro o arregla su método de pago antes de reservarle plaza.`;
}

/**
 * ¿Puede este socio ocupar una plaza nueva?
 *
 * Va a las DOS puertas de reserva —el portal/app del socio y la agenda de
 * recepción—, porque un corte que recepción se salta sin enterarse no es un
 * corte. No toca saldo: cortar por morosidad no consume ni devuelve sesiones,
 * así que el bono sigue intacto para cuando pague.
 */
export async function bookingGateForMember(
  memberId: string,
  opts: { surface: "member" | "staff"; memberName?: string; timezone?: string | null; now?: Date } = {
    surface: "member",
  }
): Promise<BookingGate> {
  const status = await getMemberDunningStatus(memberId, opts.now);
  if (!status || !status.blocked) return { allowed: true };
  return {
    allowed: false,
    reason:
      opts.surface === "staff"
        ? staffBlockedMessage(opts.memberName ?? "Este socio", status.deadline, opts.timezone)
        : memberBlockedMessage(status.graceDays),
  };
}

// ---------------------------------------------------------------------------
// Agotados los reintentos (decisión D-S6)
// ---------------------------------------------------------------------------

const DUNNING_CANCEL_ENTITY = "DunningCancellation";
const DUNNING_CANCEL_ACTION = "DUNNING_SUBSCRIPTION_CANCELLED";

/**
 * D-S6 · Stripe ha agotado sus reintentos y no ha cobrado: **se cancela**.
 *
 * La decisión se aplica en los dos lados y a propósito: en el Dashboard de
 * Stripe, la configuración de fin de reintentos tiene que estar en `cancel`
 * (`Settings → Billing → Subscriptions and emails → Manage failed payments`),
 * y aquí se cancela explícitamente en vez de esperar a que Stripe lo haga. Si
 * solo estuviera en el Dashboard, un cambio de configuración —o una cuenta
 * conectada que lo tenga en `leave as unpaid`— dejaría al socio de baja en
 * Apta y vivo en Stripe, o al revés. Los dos caminos convergen: el
 * `customer.subscription.deleted` que llega después encuentra la fila ya
 * cancelada y no hace nada.
 *
 * Idempotente por `AuditLog`: un segundo `invoice.payment_failed` sin más
 * reintentos no vuelve a llamar a Stripe.
 *
 * NO lleva clave de idempotencia porque cancelar no es una creación (es un
 * DELETE, y Stripe solo guarda claves de POST). Lo que evita el doble efecto es
 * la marca de aquí y el estado local.
 */
export async function cancelAfterRetriesExhausted(params: {
  orgId: string;
  memberId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
  invoiceId: string;
}): Promise<void> {
  const { orgId, memberId, subscriptionId, stripeSubscriptionId, invoiceId } = params;

  const already = await prisma.auditLog.findFirst({
    where: { entityType: DUNNING_CANCEL_ENTITY, entityId: stripeSubscriptionId },
    select: { id: true },
  });
  if (already) return;

  let cancelledInStripe = false;
  let stripeError: string | null = null;
  const resolved = await stripeForOrg(orgId);
  if (resolved.ok) {
    try {
      await resolved.stripe.subscriptions.cancel(stripeSubscriptionId, undefined, {
        stripeAccount: resolved.accountId,
      });
      cancelledInStripe = true;
    } catch (e) {
      // Ya cancelada en Stripe (lo habitual si el Dashboard llegó primero) o
      // error de red: ninguno de los dos puede impedir la baja local, que es lo
      // que deja de dar acceso.
      stripeError = e instanceof Error ? e.message : String(e);
    }
  } else {
    stripeError = resolved.error;
  }

  await prisma.subscription.updateMany({
    where: { id: subscriptionId, member: { orgId } },
    data: { status: "CANCELLED" },
  });
  await prisma.member.updateMany({ where: { id: memberId, orgId }, data: { state: "CANCELLED" } });

  await prisma.auditLog.create({
    data: {
      orgId,
      action: DUNNING_CANCEL_ACTION,
      entityType: DUNNING_CANCEL_ENTITY,
      entityId: stripeSubscriptionId,
      memberId,
      metadata: { invoiceId, subscriptionId, cancelledInStripe, stripeError },
    },
  });
}

/**
 * ¿Stripe ha agotado los reintentos de esta factura?
 *
 * `next_payment_attempt` es la fecha del siguiente intento automático, y en null
 * significa que no habrá otro. Pero en null está también toda factura que NO se
 * cobra sola (`collection_method: "send_invoice"`, la que se manda para que la
 * paguen a mano): esas no han agotado nada, aún no han empezado. Dar por
 * agotada una de ellas daría de baja a un socio al primer recordatorio.
 *
 * Por eso hacen falta las dos condiciones. Y por eso se exige que el cobro
 * automático conste EXPLÍCITAMENTE: ante un payload al que le falte el dato, no
 * cancelar es el error barato; cancelar, el caro.
 */
export function retriesExhausted(invoice: {
  next_payment_attempt?: number | null;
  collection_method?: string | null;
}): boolean {
  return invoice.collection_method === "charge_automatically" && invoice.next_payment_attempt == null;
}

// ---------------------------------------------------------------------------
// HU-ST-19 · Recuperación por el propio socio ("Pagar ahora")
// ---------------------------------------------------------------------------
//
// La pantalla ya existía (`/gestionar-suscripcion/[token]`) pero solo sabía
// hacer una cosa: mandar al Billing Portal de Stripe. Cambiar ahí la tarjeta NO
// cobra la factura pendiente — el socio se queda esperando al siguiente
// reintento de Stripe, que puede tardar días, con el acceso cortándose mientras
// tanto. Falta exactamente eso: reintentar la factura EN EL MOMENTO.

export type OpenInvoice = {
  invoiceId: string;
  amountDueCents: number;
  /** Página de pago alojada por Stripe, si la factura la trae. */
  hostedUrl: string | null;
  /** Descripción legible de lo que se debe. */
  concept: string | null;
};

/**
 * La factura abierta del socio, leída de Stripe. `null` si no debe nada — que
 * es lo que hay que poder distinguir para no enseñarle un botón de pagar a
 * alguien al corriente.
 */
export async function getOpenInvoiceForMember(orgId: string, memberId: string): Promise<OpenInvoice | null> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { stripeCustomerId: true },
  });
  if (!member?.stripeCustomerId) return null;

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return null;

  try {
    const invoices = await resolved.stripe.invoices.list(
      { customer: member.stripeCustomerId, status: "open", limit: 1 },
      { stripeAccount: resolved.accountId }
    );
    const invoice = invoices.data[0];
    if (!invoice?.id) return null;
    return {
      invoiceId: invoice.id,
      amountDueCents: invoice.amount_due ?? 0,
      hostedUrl: invoice.hosted_invoice_url ?? null,
      concept: invoice.lines?.data?.[0]?.description ?? null,
    };
  } catch (e) {
    console.error("[stripe-dunning] no se ha podido leer la factura pendiente", {
      orgId,
      memberId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export type RetryResult =
  | { ok: true; paid: boolean }
  | { ok: false; error: string; needsPaymentMethod: boolean };

/**
 * Códigos de error de Stripe que significan "con este método de pago no se va a
 * poder, cámbialo". Es lo que separa el escenario "método caducado" —donde
 * reintentar cien veces no sirve de nada— de un rechazo puntual del banco.
 */
const NEEDS_NEW_METHOD = new Set([
  "expired_card",
  "card_declined",
  "incorrect_cvc",
  "invalid_expiry_month",
  "invalid_expiry_year",
  "payment_method_unactivated",
  "authentication_required",
  "invoice_payment_intent_requires_action",
  "missing",
]);

/**
 * "Pagar ahora": reintenta la factura pendiente contra el método de pago que el
 * socio tenga guardado, sin esperar al siguiente reintento automático.
 *
 * Si entra, se concilia AQUÍ mismo en vez de esperar al webhook: el socio está
 * mirando la pantalla, y decirle "ya está" mientras su acceso sigue cortado
 * hasta que llegue un evento es exactamente la intervención de recepción que la
 * historia quiere quitar de en medio. La conciliación es idempotente, así que
 * el `invoice.paid` que llegue después no duplica nada.
 */
export async function retryOpenInvoice(orgId: string, memberId: string): Promise<RetryResult> {
  const open = await getOpenInvoiceForMember(orgId, memberId);
  if (!open) {
    return {
      ok: false,
      error: "No hay ninguna factura pendiente de pago en este momento.",
      needsPaymentMethod: false,
    };
  }

  const resolved = await stripeForOrg(orgId);
  if (!resolved.ok) return { ok: false, error: resolved.error, needsPaymentMethod: false };

  try {
    const invoice = await resolved.stripe.invoices.pay(open.invoiceId, undefined, {
      stripeAccount: resolved.accountId,
      idempotencyKey: invoicePayKey(orgId, open.invoiceId),
    });

    if (invoice.status === "paid") {
      // El módulo de conciliación importa de este, así que la vuelta se hace
      // con un import dinámico para no cerrar el ciclo.
      const { reconcileMemberInvoicePaid } = await import("@/lib/member-billing");
      await reconcileMemberInvoicePaid(orgId, invoice);
      return { ok: true, paid: true };
    }

    // Adeudo SEPA: el cobro se ha enviado al banco y tardará días (RB-PAGO-025).
    // No es un fallo y no se puede prometer que el acceso vuelva ya.
    return { ok: true, paid: false };
  } catch (e) {
    const code = (e as { code?: string; decline_code?: string }).code ?? "";
    const message = (e as { message?: string }).message ?? "No hemos podido completar el cobro.";
    return {
      ok: false,
      error: message,
      needsPaymentMethod: NEEDS_NEW_METHOD.has(code),
    };
  }
}
