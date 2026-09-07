import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { absoluteUrl } from "@/lib/invitations";
import { renderSepaPrenotificationEmail } from "@/lib/emails/templates";
import { formatInstantDate, DEFAULT_TIMEZONE } from "@/lib/date-utils";
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
        // El método del último cobro es lo que dice si hay domiciliación.
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

    const decision = decidePrenotification({
      hasMandate: isSepaMandate(sub.payments[0]?.method ?? null),
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
        mandateReference: mandateReference(sub.id),
        noticeDaysLabel: `${decision.daysAhead} días de antelación`,
        planName: sub.plan.name,
        portalUrl,
        postalAddress: sub.center.address ?? undefined,
      }),
    });
  }

  return sent;
}
