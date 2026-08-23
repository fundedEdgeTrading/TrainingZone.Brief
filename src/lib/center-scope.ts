import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canManageOrg } from "@/lib/rbac";

/**
 * Ámbito de centro de una persona del equipo.
 *
 * La organización es multi-centro y el rol por sí solo no dice en cuál manda:
 * eso lo dice la imputación real — su centro base (`User.centerId`) más las
 * filas de `CenterMembership`. La agenda, el aforo y la ficha de una sesión ya
 * lo respetaban; el listado y la ficha de socio no, así que una dirección de
 * centro podía abrir por URL el expediente completo (salud incluida) de un
 * socio de otro centro. Este módulo es la fuente única de esa frontera para que
 * no vuelva a haber dos criterios.
 *
 * `null` = sin frontera (dirección de organización y soporte de plataforma
 * mandan en TODA su organización, nunca en otra: el `orgId` de la sesión sigue
 * siendo obligatorio en cada consulta).
 */
export type ScopedUser = { id: string; role: Role; orgId: string; centerId: string | null };

export async function centerScopeFor(user: ScopedUser): Promise<string[] | null> {
  if (canManageOrg(user.role)) return null;

  const memberships = await prisma.centerMembership.findMany({
    where: { userId: user.id, orgId: user.orgId },
    select: { centerId: true },
  });
  const ids = new Set<string>(memberships.map((m) => m.centerId));
  if (user.centerId) ids.add(user.centerId);
  return [...ids];
}

/**
 * Cruza el ámbito del usuario con los centros que pida un filtro. Sin filtro se
 * devuelve el ámbito entero; con filtro, solo lo que esté en ambos — así un
 * `?centerId=` a mano no amplía nunca lo que se ve, solo lo reduce.
 */
export function intersectCenterScope(scope: string[] | null, requested: string[]): string[] | undefined {
  if (scope === null) return requested.length ? requested : undefined;
  if (!requested.length) return scope;
  const allowed = new Set(scope);
  return requested.filter((id) => allowed.has(id));
}

/** ¿Está la ficha de este socio dentro del ámbito de quien la pide? */
export async function isMemberInScope(user: ScopedUser, memberId: string): Promise<boolean> {
  const scope = await centerScopeFor(user);
  if (scope === null) return true;
  if (scope.length === 0) return false;

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: user.orgId, primaryCenterId: { in: scope } },
    select: { id: true },
  });
  return Boolean(member);
}

/** ¿Puede esta persona operar sobre este centro de su organización? */
export async function isCenterInScope(user: ScopedUser, centerId: string): Promise<boolean> {
  const scope = await centerScopeFor(user);
  if (scope === null) return true;
  return scope.includes(centerId);
}
