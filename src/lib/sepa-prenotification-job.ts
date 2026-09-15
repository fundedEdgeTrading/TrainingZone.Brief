import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/invitations";
import { renderSepaPrenotificationEmail } from "@/lib/emails/templates";
import { formatInstantDate, DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { resolveInvoiceSubscriptionId } from "@/lib/stripe-invoice";
import type { ReconcileResult } from "@/lib/member-billing";
import {
  decidePrenotification,
  isSepaMandate,
  mandateReference,
  nextMonthlyChargeDate,
  prenotificationKey,
  sepaNoticeFromEnv,
} from "@/lib/sepa-prenotification";

/**
 * E10-13 · Envío del preaviso de cargo SEPA, como una regla más del cron.
 *
 * El registro de envío es `AuditLog`, igual que la felicitación de cumpleaños:
 * es append-only, no exige cuenta de portal y —lo que aquí importa de verdad—
 * es la prueba de que el preaviso salió y con cuántos días. Un preaviso que no
 * se puede acreditar vale lo mismo que no haberlo mandado.
 */
const NOTICE_ENTITY = "SepaPrenotification";
const NOTICE_SENT_ACTION = "SEPA_PRENOTIFICATION_SENT";

function euros(cents: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export async function runSepaPrenotificationRule(orgId: string, now: Date = new Date()): Promise<number> {
  const notice = sepaNoticeFromEnv();

  const [org, subscriptions] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.subscription.findMany({
      // Solo cuotas vivas y recurrentes: un bono de sesiones no genera adeudo
      // periódico, y una suscripción pausada o cancelada no se va a cobrar.
      where: { status: "ACTIVE", plan: { orgId, type: "MONTHLY" } },
      select: {
        id: true,
        startDate: true,
        priceCents: true,
        plan: { select: { name: true } },
        center: { select: { timezone: true, address: true } },
        member: {
          select: {
            id: true,
            firstName: true,
            email: true,
            user: { select: { email: true } },
          },
        },
        // HU-ST-12: desde que existe `SepaMandate`, la domiciliación se sabe
        // por el mandato y no por adivinarla. El método del último cobro se
        // conserva como respaldo para los bonos anteriores al mandato: los
        // cobros de Stripe se registran como `STRIPE` sin distinguir el
        // instrumento, así que por ahí solo se reconocen los cobros que
        // recepción marcó a mano como SEPA.
        sepaMandate: { select: { reference: true, ibanLast4: true, status: true } },
        payments: {
          where: { status: "PAID" },
          orderBy: { date: "desc" },
          take: 1,
          select: { method: true },
        },
      },
    }),
  ]);

  const brandName = org?.name ?? "Training Zone";
  const brandLogoUrl = absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png");
  const portalUrl = absoluteUrl("/portal/membresia");

  let sent = 0;
  for (const sub of subscriptions) {
    const chargeDate = nextMonthlyChargeDate(sub.startDate, now);
    const key = prenotificationKey(sub.id, chargeDate);

    const already = await prisma.auditLog.findFirst({
      where: { entityType: NOTICE_ENTITY, entityId: key },
      select: { id: true },
    });

    const domiciliado =
      (sub.sepaMandate != null && sub.sepaMandate.status !== "INACTIVE") ||
      isSepaMandate(sub.payments[0]?.method ?? null);

    const decision = decidePrenotification({
      hasMandate: domiciliado,
      chargeDate,
      noticeDays: notice.days,
      now,
      alreadySent: already != null,
    });
    if (!decision.send) continue;

    const timezone = sub.center.timezone || DEFAULT_TIMEZONE;
    const chargeDateLabel = formatInstantDate(chargeDate, timezone);

    // El apunte se escribe ANTES de enviar: si el correo falla, el socio se
    // queda sin preaviso ese mes —y con la traza diciendo que debía salir— en
    // vez de recibir uno por cada pasada del cron.
    await prisma.auditLog.create({
      data: {
        orgId,
        action: NOTICE_SENT_ACTION,
        entityType: NOTICE_ENTITY,
        entityId: key,
        memberId: sub.member.id,
        metadata: {
          subscriptionId: sub.id,
          chargeDate: chargeDate.toISOString(),
          amountCents: sub.priceCents,
          noticeDays: notice.days,
          daysAhead: decision.daysAhead,
          // `late` marca el preaviso que salió con menos días de los debidos
          // (una pasada del cron perdida). Sale en la traza a propósito: es un
          // incumplimiento pequeño, y taparlo lo convierte en uno invisible.
          late: decision.late,
          basis: notice.basis,
        },
      },
    });
    sent++;

    const to = sub.member.user?.email ?? sub.member.email;
    if (!to) continue;

    // Correo de servicio: NO pasa por `canSendMemberEmail`. El socio que
    // desactivó las comunicaciones prescindibles sigue teniendo derecho a
    // saber cuándo y cuánto le van a cargar.
    void sendMail({
      to,
      fromName: brandName,
      subject: `Aviso de cargo de ${euros(sub.priceCents)} el ${chargeDateLabel}`,
      html: renderSepaPrenotificationEmail({
        memberFirstName: sub.member.firstName,
        brandName,
        brandLogoUrl,
        amountLabel: euros(sub.priceCents),
        chargeDateLabel,
        method: "SEPA",
        paymentMethodLabel: sub.sepaMandate?.ibanLast4 ? `IBAN ···· ${sub.sepaMandate.ibanLast4}` : undefined,
        mandateReference: sub.sepaMandate?.reference ?? mandateReference(sub.id),
        noticeDaysLabel: `${decision.daysAhead} días de antelación`,
        planName: sub.plan.name,
        portalUrl,
        postalAddress: sub.center.address ?? undefined,
      }),
    });
  }

  return sent;
}

// ---------------------------------------------------------------------------
// HU-ST-16 · Preaviso disparado por `invoice.upcoming`
// ---------------------------------------------------------------------------
//
// No se construye desde cero y, sobre todo, no se duplica: la mitad pura
// —plazos, fechas, decisión— es la de `sepa-prenotification.ts`, y el sello de
// "ya enviado" es el MISMO `AuditLog` que usa el cron de arriba. Sin compartir
// la marca, un socio cuya suscripción cae dentro de las dos vías recibiría dos
// avisos del mismo cargo: uno del cron y otro del webhook.
//
// Lo que aporta este evento frente al cron es la fecha de cargo REAL de Stripe
// en vez de una deducida del aniversario del alta. Y ojo: una `invoice.upcoming`
// **no tiene `id`** —todavía no existe como factura—, así que la clave de
// idempotencia sale de la suscripción y del periodo, que es justo lo que ya
// hace `prenotificationKey()`.

/**
 * `invoice.upcoming` · Stripe avisa X días antes del cargo. Es el único evento
 * que llega ANTES de mover dinero, y por eso es el que sirve de preaviso.
 *
 * Es correo de SERVICIO: se envía aunque el socio haya desactivado los avisos
 * comerciales, y no lleva enlace de baja.
 */
export async function sendPrenotificationForUpcomingInvoice(
  orgId: string,
  invoice: Stripe.Invoice
): Promise<ReconcileResult> {
  const stripeSubscriptionId = resolveInvoiceSubscriptionId(invoice);
  // Una factura suelta (un cargo puntual emitido a mano desde el Dashboard) no
  // tiene cuota detrás que preavisar.
  if (!stripeSubscriptionId) return { ok: true };

  const subscription = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId },
    select: {
      id: true,
      priceCents: true,
      plan: { select: { name: true } },
      center: { select: { timezone: true, address: true } },
      member: {
        select: { id: true, orgId: true, firstName: true, email: true, user: { select: { email: true } } },
      },
      // El mandato es lo que distingue un adeudo domiciliado de una tarjeta, y
      // con él el plazo que hay que respetar y lo que el correo puede prometer.
      sepaMandate: { select: { reference: true, ibanLast4: true, status: true } },
    },
  });
  // Stripe no garantiza el orden de entrega: puede llegar el preaviso de una
  // suscripción que aún no existe localmente. Es retryable, no un no-op.
  if (!subscription) {
    return { ok: false, retry: true, error: `Suscripción ${stripeSubscriptionId} aún no existe localmente.` };
  }
  if (subscription.member.orgId !== orgId) return { ok: true }; // aislamiento: no es de esta org

  // La fecha de cargo REAL: `next_payment_attempt` es cuándo se va a intentar
  // el cobro; el fin de periodo es el suelo cuando no viene.
  const chargeSeconds = invoice.next_payment_attempt ?? invoice.period_end ?? null;
  if (!chargeSeconds) return { ok: true };
  const chargeDate = new Date(chargeSeconds * 1000);

  const domiciliado = subscription.sepaMandate != null && subscription.sepaMandate.status !== "INACTIVE";
  const notice = sepaNoticeFromEnv();

  const key = prenotificationKey(subscription.id, chargeDate);
  const already = await prisma.auditLog.findFirst({
    where: { entityType: NOTICE_ENTITY, entityId: key },
    select: { id: true },
  });

  const decision = decidePrenotification({
    hasMandate: true,
    chargeDate,
    // Los 14 días son del esquema SEPA y solo atan al adeudo domiciliado. Un
    // cobro con tarjeta se preavisa igual —lo pide la historia— pero en cuanto
    // Stripe avisa, sin esperar a un plazo que no le aplica.
    noticeDays: domiciliado ? notice.days : Number.MAX_SAFE_INTEGER,
    now: new Date(),
    alreadySent: already != null,
  });
  if (!decision.send) return { ok: true };

  const amountCents = invoice.amount_due ?? subscription.priceCents;
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } });

  // El apunte se escribe ANTES de enviar, igual que en el cron: si el correo
  // falla, el socio se queda sin preaviso de ESE cargo —y con la traza diciendo
  // que debía salir— en vez de recibir uno por cada reentrega del evento.
  await prisma.auditLog.create({
    data: {
      orgId,
      action: NOTICE_SENT_ACTION,
      entityType: NOTICE_ENTITY,
      entityId: key,
      memberId: subscription.member.id,
      metadata: {
        subscriptionId: subscription.id,
        chargeDate: chargeDate.toISOString(),
        amountCents,
        noticeDays: domiciliado ? notice.days : null,
        daysAhead: decision.daysAhead,
        late: domiciliado ? decision.late : false,
        basis: domiciliado ? notice.basis : "Cobro con tarjeta: no está sujeto al plazo del esquema SEPA Core.",
        source: "invoice.upcoming",
        sepa: domiciliado,
      },
    },
  });

  const to = subscription.member.user?.email ?? subscription.member.email;
  if (!to) return { ok: true };

  const timezone = subscription.center.timezone || DEFAULT_TIMEZONE;
  const brandName = org?.name ?? "Training Zone";
  const amountLabel = euros(amountCents);
  const chargeDateLabel = formatInstantDate(chargeDate, timezone);

  void sendMail({
    to,
    fromName: brandName,
    subject: `Aviso de cargo de ${amountLabel} el ${chargeDateLabel}`,
    html: renderSepaPrenotificationEmail({
      memberFirstName: subscription.member.firstName,
      brandName,
      brandLogoUrl: absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png"),
      amountLabel,
      chargeDateLabel,
      method: domiciliado ? "SEPA" : "CARD",
      paymentMethodLabel: domiciliado
        ? `IBAN ···· ${subscription.sepaMandate?.ibanLast4 || "····"}`
        : "Tarjeta guardada",
      mandateReference: subscription.sepaMandate?.reference ?? mandateReference(subscription.id),
      noticeDaysLabel: `${decision.daysAhead} días de antelación`,
      planName: subscription.plan.name,
      portalUrl: absoluteUrl("/portal/membresia"),
      postalAddress: subscription.center.address ?? undefined,
    }),
  });

  return { ok: true };
}
