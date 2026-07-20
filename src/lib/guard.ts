import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { defaultRouteForRole, canManageOrg } from "@/lib/rbac";

export async function requireRole(allowed: Role[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect(defaultRouteForRole(session.user.role));
  }
  return session;
}

/**
 * Guarda por rol *dentro de un centro concreto* (RBAC con ámbito).
 *
 * Los roles de ámbito organización (OWNER / PLATFORM_ADMIN) pasan siempre.
 * Para el resto, además de tener un rol permitido, el usuario debe estar
 * imputado a ese centro — su centro base (`User.centerId`) o una fila en
 * `CenterMembership`. Así el ámbito efectivo se resuelve contra la imputación
 * real (una persona puede trabajar en varios centros con distinto rol), no
 * solo contra el rol global.
 */
export async function requireCenterRole(centerId: string, allowed: Role[]) {
  const session = await requireSession();
  const { id: userId, role, orgId, centerId: baseCenterId } = session.user;

  if (canManageOrg(role)) return session;

  if (allowed.includes(role)) {
    if (baseCenterId === centerId) return session;
    const membership = await prisma.centerMembership.findFirst({
      where: { userId, centerId, orgId },
      select: { id: true },
    });
    if (membership) return session;
  }

  redirect(defaultRouteForRole(role));
}
