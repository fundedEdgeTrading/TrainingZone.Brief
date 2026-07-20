import { prisma } from "@/lib/prisma";
import { canManageOrg } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * Centros visibles para un usuario según su imputación real:
 * - OWNER / PLATFORM_ADMIN: todos los centros de la organización.
 * - Resto de staff: su centro base (`centerId`) más los centros donde tenga
 *   una fila en `CenterMembership` (imputación multi-centro).
 */
export async function getCentersForUser(user: {
  id: string;
  role: Role;
  orgId: string;
  centerId: string | null;
}) {
  if (canManageOrg(user.role)) {
    return prisma.center.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } });
  }

  const memberships = await prisma.centerMembership.findMany({
    where: { userId: user.id, orgId: user.orgId },
    select: { centerId: true },
  });
  const ids = new Set<string>(memberships.map((m) => m.centerId));
  if (user.centerId) ids.add(user.centerId);

  return prisma.center.findMany({
    where: { orgId: user.orgId, id: { in: [...ids] } },
    orderBy: { name: "asc" },
  });
}

export async function getWeekSessions(orgId: string, centerId: string, weekStart: Date, weekEnd: Date) {
  const sessions = await prisma.classSession.findMany({
    where: {
      orgId,
      centerId,
      date: { gte: weekStart, lt: weekEnd },
    },
    include: {
      trainer: { select: { name: true } },
      bookings: { select: { id: true, status: true } },
    },
    orderBy: { date: "asc" },
  });
  return sessions;
}

export async function getSessionDetail(orgId: string, sessionId: string) {
  return prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: {
        include: { member: { select: { id: true, firstName: true, lastName: true, state: true } } },
        orderBy: [{ status: "asc" }, { bookedAt: "asc" }],
      },
    },
  });
}
