import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
import {
  CONSECUTIVE_NO_SHOW_THRESHOLD,
  NO_SHOW_REASONS_WITHOUT_NOTICE,
  consecutiveNoShowsWithoutNotice,
  type AttendanceEntry,
} from "@/lib/no-show";

/**
 * RB-RES-009: alerta a dirección por faltas seguidas sin avisar. Misma forma
 * que el resto de reglas automáticas del sistema (trainer-alerts.ts): reutiliza
 * el motor de Notification vía `createNotificationOnce` y avisa a dirección del
 * centro, no al entrenador.
 */

/**
 * `entityType` propio y no "Member": `createNotificationOnce` deduplica por
 * (destinatario, entidad) y con "Member" esta alerta se la habría comido
 * cualquier otra tarea abierta del mismo socio (bono bajo, pocas sesiones...).
 * El `entityId` sigue siendo el id del socio, así que la campana enlaza a su
 * ficha igual que el resto (ENTITY_HREF en notification-bell.tsx).
 */
export const NO_SHOW_STREAK_ENTITY = "MemberNoShowStreak";

/** Últimas sesiones consumidas por el socio, de la más reciente a la más antigua. */
async function recentAttendance(memberId: string, take = 10): Promise<AttendanceEntry[]> {
  return prisma.booking.findMany({
    where: { memberId, status: { in: ["ATTENDED", "NO_SHOW"] } },
    select: { status: true, noShowReason: true },
    orderBy: [{ occurrenceDate: "desc" }, { bookedAt: "desc" }],
    take,
  });
}

async function orgDirectors(orgId: string) {
  // Misma dirección que el resto de alertas automáticas (trainer-alerts.ts): la
  // organización ya no tiene entrenador fijo por socio al que avisar.
  return prisma.user.findMany({
    where: { orgId, role: { in: ["OWNER", "CENTER_DIRECTOR"] }, deactivatedAt: null },
    select: { id: true },
  });
}

/**
 * RB-RES-009: tres faltas seguidas sin aviso del mismo cliente son una señal
 * comercial, no un incidente de agenda, así que van a dirección. Se comprueba
 * justo después de marcar la falta (agenda/session/[id]/actions.ts) y también
 * en la pasada del cron, por si la tercera falta se registró por otra vía.
 *
 * Devuelve cuántas notificaciones se han creado (0 si no hay racha, o si la
 * anterior sigue sin resolver).
 */
export async function notifyConsecutiveNoShows(orgId: string, memberId: string): Promise<number> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) return 0;

  const history = await recentAttendance(member.id);
  const streak = consecutiveNoShowsWithoutNotice(history);
  if (streak < CONSECUTIVE_NO_SHOW_THRESHOLD) return 0;

  const directors = await orgDirectors(orgId);
  let created = 0;
  for (const director of directors) {
    await createNotificationOnce({
      orgId,
      recipientUserId: director.id,
      kind: "TASK",
      title: `${member.firstName} ${member.lastName}: ${streak} faltas seguidas sin avisar`,
      body: `Ha faltado ${streak} veces seguidas sin aviso (RB-RES-009). Contacta con el cliente antes de que se descuelgue.`,
      entityType: NO_SHOW_STREAK_ENTITY,
      entityId: member.id,
    });
    created++;
  }
  return created;
}

/**
 * Pasada completa de la regla para una organización, con la misma forma que el
 * resto de reglas temporales (/api/jobs/run). Solo entran los socios con alguna
 * falta sin aviso registrada: quien no la tenga no puede tener racha, y así no
 * hay que recorrer el histórico de asistencia de toda la organización.
 */
export async function runConsecutiveNoShowsRule(orgId: string): Promise<number> {
  const candidates = await prisma.booking.findMany({
    where: {
      status: "NO_SHOW",
      noShowReason: { in: [...NO_SHOW_REASONS_WITHOUT_NOTICE] },
      member: { orgId, state: "ACTIVE" },
    },
    select: { memberId: true },
    distinct: ["memberId"],
  });

  let created = 0;
  for (const { memberId } of candidates) {
    created += await notifyConsecutiveNoShows(orgId, memberId);
  }
  return created;
}
