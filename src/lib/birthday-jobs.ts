import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderBirthdayEmail } from "@/lib/emails/templates";
import { absoluteUrl } from "@/lib/invitations";
import { createNotification, resolveNotification } from "@/lib/notifications";
import { isBirthdayOn, zonedToday, DEFAULT_TIMEZONE } from "@/lib/date-utils";

/**
 * F5 — felicitación de cumpleaños. Dos registros con papeles distintos:
 *
 * - `AuditLog` (append-only, no exige cuenta de usuario) es el **registro de
 *   envío**: es lo que hace idempotente la regla para TODOS los socios,
 *   también los que no tienen portal. Una segunda pasada del cron el mismo día
 *   no manda un segundo correo.
 * - `Notification` es la **pantalla** de felicitación del portal, y su
 *   `resolvedAt` es el descarte: al cerrarla no vuelve a aparecer. Solo existe
 *   para socios con cuenta.
 */
const GREETING_ENTITY = "BirthdayGreeting";
const GREETING_SENT_ACTION = "BIRTHDAY_GREETING_SENT";

/** Una felicitación por socio y año natural. */
function greetingKey(memberId: string, year: number): string {
  return `${memberId}:${year}`;
}

export async function runBirthdayRule(orgId: string): Promise<number> {
  const [org, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true, logoUrl: true } }),
    prisma.member.findMany({
      // Solo socios activos: un "gracias por estar con nosotros" a quien se dio
      // de baja hace tres meses es peor que el silencio.
      where: { orgId, state: "ACTIVE", birthDate: { not: null } },
      select: {
        id: true,
        firstName: true,
        email: true,
        birthDate: true,
        userId: true,
        primaryCenter: { select: { timezone: true } },
        user: { select: { email: true } },
      },
    }),
  ]);

  const brandName = org?.name ?? "Training Zone";
  const brandLogoUrl = absoluteUrl(org?.logoUrl || "/brand/tz-logo-white.png");
  const portalUrl = absoluteUrl("/portal");

  let greeted = 0;
  for (const member of members) {
    if (!member.birthDate) continue;
    // El día se mide en el calendario del centro: un cron en UTC a las 00:00
    // felicitaría el día anterior a un centro español en horario de verano.
    const today = zonedToday(member.primaryCenter.timezone || DEFAULT_TIMEZONE);
    if (!isBirthdayOn(member.birthDate, today)) continue;

    const key = greetingKey(member.id, today.getFullYear());
    const already = await prisma.auditLog.findFirst({
      where: { entityType: GREETING_ENTITY, entityId: key },
      select: { id: true },
    });
    if (already) continue;

    // El registro se escribe ANTES de enviar: si el correo falla, el socio se
    // queda sin felicitación ese año, que es mejor que recibir tres.
    await prisma.auditLog.create({
      data: {
        orgId,
        action: GREETING_SENT_ACTION,
        entityType: GREETING_ENTITY,
        entityId: key,
        memberId: member.id,
        metadata: { year: today.getFullYear() },
      },
    });
    greeted++;

    if (member.userId) {
      await createNotification({
        orgId,
        recipientUserId: member.userId,
        kind: "INFO",
        title: `¡Felicidades, ${member.firstName}!`,
        body: "Gracias por estar con nosotros. Esperamos felicitarte muchos más.",
        entityType: GREETING_ENTITY,
        entityId: key,
      });
    }

    const to = member.user?.email ?? member.email;
    if (!to) continue;
    void sendMail({
      to,
      fromName: brandName,
      subject: `¡Felicidades, ${member.firstName}!`,
      html: renderBirthdayEmail({ memberFirstName: member.firstName, brandName, brandLogoUrl, portalUrl }),
    });
  }

  return greeted;
}

export type BirthdayGreeting = { id: string; title: string; body: string | null };

/**
 * Felicitación pendiente de ver de un socio, para web y app móvil (endpoint
 * compartido `/api/portal/greeting`). Acotada al año en curso: una
 * felicitación que nadie llegó a abrir no puede saltar en marzo.
 */
export async function getPendingBirthdayGreeting(
  orgId: string,
  userId: string,
  memberId: string,
  timeZone: string
): Promise<BirthdayGreeting | null> {
  const key = greetingKey(memberId, zonedToday(timeZone).getFullYear());
  return prisma.notification.findFirst({
    where: { orgId, recipientUserId: userId, entityType: GREETING_ENTITY, entityId: key, resolvedAt: null },
    select: { id: true, title: true, body: true },
  });
}

/** Descarte persistente: `resolvedAt` es lo que impide que vuelva a aparecer. */
export async function dismissBirthdayGreeting(orgId: string, userId: string, notificationId: string) {
  return resolveNotification(orgId, userId, notificationId);
}
