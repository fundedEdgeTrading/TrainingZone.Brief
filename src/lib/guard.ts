import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { requireSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { defaultRouteForRole, canManageOrg } from "@/lib/rbac";
import { isCenterInScope, isMemberInScope, type ScopedUser } from "@/lib/center-scope";
import { isPlatformOperational } from "@/lib/entitlements";

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
/**
 * RB-PLAT-001: gatea el acceso por `Organization.platformStatus` (A.3). Pensado
 * para usarse fuera del layout de `(app)` — p.ej. en rutas server-only que no
 * pasan por él. `PLATFORM_ADMIN` está exento (soporte de Apta).
 */
export async function requirePlatformActive() {
  const session = await requireSession();
  if (session.user.role === "PLATFORM_ADMIN") return session;

  const org = await prisma.organization.findUnique({
    where: { id: session.user.orgId },
    select: { platformStatus: true },
  });
  if (org && isPlatformOperational(org.platformStatus)) return session;

  redirect("/activar");
}

export async function requireCenterRole(centerId: string, allowed: Role[]) {
  const session = await requireSession();
  const { id: userId, role, orgId, centerId: baseCenterId } = session.user;

  // OWNER / PLATFORM_ADMIN mandan en toda SU organización, no en cualquiera:
  // devolver la sesión sin mirar el centro dejaba pasar un `centerId` de otra
  // organización, que es justo lo que esta guarda debe cortar.
  if (canManageOrg(role)) {
    const center = await prisma.center.findFirst({ where: { id: centerId, orgId }, select: { id: true } });
    if (center) return session;
    redirect(defaultRouteForRole(role));
  }

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

/**
 * Ámbito de centro sobre la ficha de un socio.
 *
 * `requireCenterRole` pide un `centerId`; aquí el centro sale del propio socio,
 * que es lo que se está mirando o tocando. Dirección de organización y soporte
 * de plataforma pasan siempre (dentro de SU organización); al resto del equipo
 * solo le abren los socios de los centros a los que está imputado.
 *
 * Devuelve `false` en vez de redirigir para poder usarse también desde una
 * server action, donde lo correcto es responder un error, no una navegación.
 */
export async function memberIsInScope(user: ScopedUser, memberId: string): Promise<boolean> {
  return isMemberInScope(user, memberId);
}

/** Igual, para el centro que una acción quiere usar (alta, cambio de centro, bono). */
export async function centerIsInScope(user: ScopedUser, centerId: string): Promise<boolean> {
  return isCenterInScope(user, centerId);
}

/** Mensajes únicos para las acciones que rechazan por ámbito de centro. */
export const OUT_OF_CENTER_SCOPE = "Este socio no es de tus centros.";
export const CENTER_OUT_OF_SCOPE = "Ese centro no es uno de los tuyos.";
