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

/**
 * E1-07: los centros de un socio. Su centro base (`primaryCenterId`) y, además,
 * aquellos donde de hecho entrena — un socio puede tener sesiones en más de un
 * centro aunque su ficha cuelgue de uno solo, y la falta ocurrió en la sala de
 * alguien.
 */
async function memberCenterIds(orgId: string, memberId: string, primaryCenterId: string): Promise<string[]> {
  const centers = await prisma.center.findMany({
    where: {
      orgId,
      OR: [{ id: primaryCenterId }, { sessions: { some: { bookings: { some: { memberId } } } } }],
    },
    select: { id: true },
  });
  return centers.map((c) => c.id);
}

/**
 * Quién recibe la alerta (E1-07). La documentación dice "dirección **del
 * centro**" (CRM_REGLAS_NEGOCIO.md, RB-RES-009) y el código seleccionaba
 * `role in [OWNER, CENTER_DIRECTOR]` de toda la organización: con eso, el
 * nombre y apellidos de un socio de La Jota cruzaban la frontera hasta la
 * bandeja de Santander.
 *
 * La dirección de organización sí la recibe siempre: manda en toda su
 * organización y esto es una señal comercial, no un incidente de sala.
 */
async function alertRecipients(orgId: string, centerIds: string[]) {
  return prisma.user.findMany({
    where: {
      orgId,
      deactivatedAt: null,
      OR: [
        { role: "OWNER" },
        {
          role: "CENTER_DIRECTOR",
          // Su imputación real, igual que `centerScopeFor`: centro base más las
          // filas de `CenterMembership`.
          OR: [
            { centerId: { in: centerIds } },
            { centerMemberships: { some: { centerId: { in: centerIds } } } },
          ],
        },
      ],
    },
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
    select: { id: true, firstName: true, lastName: true, primaryCenterId: true },
  });
  if (!member) return 0;

  const history = await recentAttendance(member.id);
  const streak = consecutiveNoShowsWithoutNotice(history);
  if (streak < CONSECUTIVE_NO_SHOW_THRESHOLD) return 0;

  const centerIds = await memberCenterIds(orgId, member.id, member.primaryCenterId);
  const directors = await alertRecipients(orgId, centerIds);
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

  await closeStaleNoShowStreaks(orgId);
  return created;
}

/**
 * E12-14: las rachas ya formadas se recalculan.
 *
 * La racha se deriva del histórico en cada lectura, así que sacar `OUR_ERROR`
 * de los motivos que cuentan basta para que deje de sumar de aquí en adelante.
 * Lo que no se arregla solo es la tarea que YA está abierta: dirección sigue
 * viendo "3 faltas seguidas sin avisar" de un socio al que citó mal el centro.
 * Esta pasada recorre las alertas abiertas y cierra las que, con la regla de
 * ahora, no llegan al umbral.
 */
async function closeStaleNoShowStreaks(orgId: string): Promise<number> {
  const rows = await prisma.notification.findMany({
    where: { orgId, entityType: NO_SHOW_STREAK_ENTITY, resolvedAt: null, entityId: { not: null } },
    select: { id: true, entityId: true },
  });
  const open = rows.filter((n): n is { id: string; entityId: string } => n.entityId != null);
  if (open.length === 0) return 0;

  // Una racha por socio, aunque la alerta esté abierta para varias personas de
  // dirección: `entityId` es el id del socio.
  const streaks = new Map<string, number>();
  for (const notification of open) {
    if (streaks.has(notification.entityId)) continue;
    streaks.set(notification.entityId, consecutiveNoShowsWithoutNotice(await recentAttendance(notification.entityId)));
  }

  const stale = open.filter((n) => (streaks.get(n.entityId) ?? 0) < CONSECUTIVE_NO_SHOW_THRESHOLD);
  if (stale.length === 0) return 0;

  await prisma.notification.updateMany({
    where: { id: { in: stale.map((n) => n.id) } },
    data: { resolvedAt: new Date() },
  });
  return stale.length;
}
