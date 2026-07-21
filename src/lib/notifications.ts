import { prisma } from "@/lib/prisma";
import type { NotificationKind } from "@prisma/client";

/**
 * Motor de notificaciones/tareas (F10, transversal). Punto único de creación y
 * resolución para que todas las reglas temporales (24h sin responsable, pocas
 * sesiones programadas, valoración pendiente, oferta sugerida, estancamiento...)
 * compartan el mismo modelo y la misma bandeja de entrada.
 */
export async function createNotification(input: {
  orgId: string;
  recipientUserId: string;
  kind?: NotificationKind;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  dueDate?: Date;
}) {
  return prisma.notification.create({
    data: {
      orgId: input.orgId,
      recipientUserId: input.recipientUserId,
      kind: input.kind ?? "TASK",
      title: input.title,
      body: input.body,
      entityType: input.entityType,
      entityId: input.entityId,
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

export async function resolveNotification(orgId: string, userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, orgId, recipientUserId: userId },
    select: { id: true },
  });
  if (!notification) return { ok: false as const };
  await prisma.notification.update({ where: { id: notificationId }, data: { resolvedAt: new Date() } });
  return { ok: true as const };
}
