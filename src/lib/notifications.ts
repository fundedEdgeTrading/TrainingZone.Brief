import { prisma } from "@/lib/prisma";
import type { NotificationKind, TaskPriority } from "@prisma/client";

/**
 * Motor de notificaciones/tareas (F10, transversal). Punto único de creación y
 * resolución para que todas las reglas temporales (24h sin responsable, pocas
 * sesiones programadas, valoración pendiente, oferta sugerida, estancamiento...)
 * compartan el mismo modelo y la misma bandeja de entrada.
 */
export async function createNotification(input: {
  orgId: string;
  recipientUserId: string;
  /**
   * Quién la encarga. Las reglas temporales lo dejan vacío a propósito: detrás
   * de ellas no hay una persona, y firmarlas con el usuario del cron sería
   * mentir sobre quién pidió el trabajo. Solo lo rellena el alta manual
   * (lib/tasks-queries.ts), y la reasignación no lo toca.
   */
  createdByUserId?: string;
  kind?: NotificationKind;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  category?: string;
  priority?: TaskPriority;
  dueDate?: Date;
}) {
  return prisma.notification.create({
    data: {
      orgId: input.orgId,
      recipientUserId: input.recipientUserId,
      createdByUserId: input.createdByUserId,
      kind: input.kind ?? "TASK",
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
      category: input.category,
      priority: input.priority ?? "MEDIA",
      dueDate: input.dueDate,
    },
  });
}

/** Evita duplicar la misma tarea abierta para la misma entidad y destinatario. */
export async function createNotificationOnce(input: Parameters<typeof createNotification>[0]) {
  const existing = await prisma.notification.findFirst({
    where: {
      orgId: input.orgId,
      recipientUserId: input.recipientUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      resolvedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing;
  return createNotification(input);
}

export async function listNotificationsForUser(orgId: string, userId: string, opts: { includeResolved?: boolean } = {}) {
  return prisma.notification.findMany({
    where: {
      orgId,
      recipientUserId: userId,
      resolvedAt: opts.includeResolved ? undefined : null,
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
}

export async function countUnresolvedForUser(orgId: string, userId: string) {
  return prisma.notification.count({ where: { orgId, recipientUserId: userId, resolvedAt: null } });
}

/**
 * Único camino a "completada", lo mismo si la tarea la levantó una regla que si
 * la encargó una persona: la campana, el tablero y la lista pasan todos por
 * aquí. Al quedar `resolvedAt` escrito, la tarea sale de las vistas activas y
 * pasa a consultarse solo desde el histórico.
 *
 * `anyRecipient` abre la resolución a quien reparte trabajo (dirección,
 * Entrenador Admin) sobre tareas de otra persona; sin él sigue mandando la
 * regla de siempre —solo el destinatario cierra lo suyo—, que es lo que
 * necesita la campana.
 */
export async function resolveNotification(
  orgId: string,
  userId: string,
  notificationId: string,
  opts: { anyRecipient?: boolean } = {}
) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, orgId, recipientUserId: opts.anyRecipient ? undefined : userId },
    select: { id: true },
  });
  if (!notification) return { ok: false as const };
  await prisma.notification.update({ where: { id: notificationId }, data: { resolvedAt: new Date() } });
  return { ok: true as const };
}
