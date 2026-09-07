import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";
import { renderSessionReminderEmail } from "@/lib/emails/templates";
import { sessionStartsAt, CANCEL_WINDOW_HOURS } from "@/lib/portal-queries";
import { DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { absoluteUrl } from "@/lib/site";

/**
 * E5-03/RB-RES-013: recordatorios de sesión a 24h y 2h — el único canal es el
 * email (el push queda congelado por el alcance de la app). Disparado desde
 * `/api/jobs/run`, como el resto de reglas temporales.
 *
 * Aviso de cadencia: `/api/jobs/run` corre HOY una sola vez al día
 * (`.github/workflows/jobs-cron.yml` / `render.yaml`, ambos a las 05:00 UTC).
 * El recordatorio de 24h vive bien con esa cadencia (siempre hay una pasada
 * antes de mañana), pero el de 2h solo puede llegar puntual si el cron corre
 * con más frecuencia — devops tendría que programar `/api/jobs/run` (o un
 * endpoint dedicado más ligero) cada hora para que RB-RES-013 cumpla de
 * verdad su plazo de 2h en sesiones de tarde/noche. La regla de aquí es
 * correcta para cualquier cadencia: idempotente por reserva y por umbral, así
 * que corre sin duplicar en cuanto la cadencia mejore.
 */

const REMINDER_ENTITY = "Booking";
const REMINDER_24H_ACTION = "SESSION_REMINDER_24H_SENT";
const REMINDER_2H_ACTION = "SESSION_REMINDER_2H_SENT";

type ReminderKind = "24H" | "2H";
const REMINDER_ACTION: Record<ReminderKind, string> = { "24H": REMINDER_24H_ACTION, "2H": REMINDER_2H_ACTION };
const REMINDER_THRESHOLD_HOURS: Record<ReminderKind, number> = { "24H": 24, "2H": 2 };

// ---------- Preferencia propia del socio (independiente del resto de correo) ----------
//
// `Member` no tiene una columna dedicada para esto y `prisma/schema.prisma`
// está congelado este trimestre (ver AGENTS.md), así que la preferencia se
// deriva del último registro en `AuditLog` — mismo patrón que ya usa
// `sendDunningNoticeOnce` para marcar "ya avisado" sin una columna nueva.
// Migrar a `Member.notifyReminders` en cuanto se abra la ventana de schema es
// la mejora obvia; mientras tanto este es el único punto que lee o escribe la
// preferencia, así que migrar es un cambio de un solo sitio.
const REMINDER_PREFERENCE_ENTITY = "MemberSessionReminderPreference";
const REMINDER_PREFERENCE_ACTION = "SESSION_REMINDER_PREFERENCE_SET";

export async function memberWantsSessionReminders(memberId: string): Promise<boolean> {
  const last = await prisma.auditLog.findFirst({
    where: { entityType: REMINDER_PREFERENCE_ENTITY, entityId: memberId, action: REMINDER_PREFERENCE_ACTION },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  if (!last) return true; // por defecto, activados
  const metadata = last.metadata as { enabled?: boolean } | null;
  return metadata?.enabled !== false;
}

export async function setMemberSessionReminderPreference(orgId: string, memberId: string, enabled: boolean): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId,
      action: REMINDER_PREFERENCE_ACTION,
      entityType: REMINDER_PREFERENCE_ENTITY,
      entityId: memberId,
      memberId,
      metadata: { enabled },
    },
  });
}

// ---------- Envío ----------

type ReminderBooking = {
  id: string;
  occurrenceDate: Date;
  member: { id: string; firstName: string; email: string; user: { email: string } | null };
  session: {
    name: string;
    startTime: string;
    room: string | null;
    trainer: { name: string } | null;
    center: { name: string; timezone: string };
  };
};

async function sendReminderOnce(orgId: string, booking: ReminderBooking, kind: ReminderKind): Promise<boolean> {
  const action = REMINDER_ACTION[kind];
  const already = await prisma.auditLog.findFirst({
    where: { entityType: REMINDER_ENTITY, entityId: booking.id, action },
    select: { id: true },
  });
  if (already) return false;

  if (!(await memberWantsSessionReminders(booking.member.id))) return false;

  const to = booking.member.user?.email ?? booking.member.email;
  if (!to) return false;

  const timezone = booking.session.center.timezone || DEFAULT_TIMEZONE;
  const startsAt = sessionStartsAt(booking.occurrenceDate, booking.session.startTime, timezone);
  const dateLabel = startsAt.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  // Se registra ANTES de enviar (idempotencia ante un fallo de envío a mitad
  // de esta pasada), mismo patrón que `sendDunningNoticeOnce`.
  await prisma.auditLog.create({
    data: { orgId, action, entityType: REMINDER_ENTITY, entityId: booking.id, memberId: booking.member.id, metadata: { startsAt } },
  });

  void sendMail({
    to,
    fromName: booking.session.center.name,
    subject: kind === "24H" ? "Mañana entrenas" : "Tu sesión empieza en 2 horas",
    html: renderSessionReminderEmail({
      memberFirstName: booking.member.firstName,
      brandName: booking.session.center.name,
      brandLogoUrl: absoluteUrl("/brand/tz-logo-white.png"),
      variant: kind,
      sessionName: booking.session.name,
      dateLabel,
      startTime: booking.session.startTime,
      centerName: booking.session.center.name,
      agendaUrl: absoluteUrl("/portal/agenda"),
      room: booking.session.room ?? undefined,
      trainerName: booking.session.trainer?.name,
      cancelWindowHours: CANCEL_WINDOW_HOURS,
    }),
  });

  return true;
}

/** RB-RES-013: recordatorios a 24h y 2h de reservas BOOKED que aún no han empezado. */
export async function runSessionReminderRule(orgId: string): Promise<number> {
  const now = new Date();
  // Ventana amplia a propósito (ver cabecera): cubre sobradamente ambos
  // umbrales sea cual sea la cadencia real del cron.
  const horizonStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const horizonEnd = new Date(now.getTime() + 26 * 60 * 60 * 1000);

  const bookings = await prisma.booking.findMany({
    where: {
      status: "BOOKED",
      member: { orgId },
      occurrenceDate: { gte: horizonStart, lte: horizonEnd },
      session: { status: "SCHEDULED" },
    },
    select: {
      id: true,
      occurrenceDate: true,
      member: { select: { id: true, firstName: true, email: true, user: { select: { email: true } } } },
      session: {
        select: {
          name: true,
          startTime: true,
          room: true,
          status: true,
          trainer: { select: { name: true } },
          center: { select: { name: true, timezone: true } },
        },
      },
    },
  });

  let sent = 0;
  for (const booking of bookings) {
    const timezone = booking.session.center.timezone || DEFAULT_TIMEZONE;
    const startsAt = sessionStartsAt(booking.occurrenceDate, booking.session.startTime, timezone);
    const hoursUntilStart = (startsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (hoursUntilStart <= 0) continue; // ya empezó o pasó: no se avisa de lo que ya fue

    for (const kind of Object.keys(REMINDER_THRESHOLD_HOURS) as ReminderKind[]) {
      if (hoursUntilStart > REMINDER_THRESHOLD_HOURS[kind]) continue;
      if (await sendReminderOnce(orgId, booking, kind)) sent++;
    }
  }

  return sent;
}
