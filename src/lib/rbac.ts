import type { Role } from "@prisma/client";

/**
 * Matriz de permisos (A.2.5). Ámbito: rol x módulo.
 * "own" = solo su propio ámbito (sus sesiones, su ficha); "center" = su
 * centro; "org" = toda la organización.
 */
export const NAV_BY_ROLE: Record<
  Role,
  { href: string; label: string }[]
> = {
  OWNER: [
    { href: "/dashboard", label: "Panel de control" },
    { href: "/members", label: "Socios" },
    { href: "/agenda", label: "Agenda" },
    { href: "/billing", label: "Cobros" },
    { href: "/retention", label: "Retención" },
    { href: "/health/aptitude-rules", label: "Reglas de aptitud" },
    { href: "/audit", label: "Auditoría" },
  ],
  CENTER_DIRECTOR: [
    { href: "/dashboard", label: "Panel de control" },
    { href: "/members", label: "Socios" },
    { href: "/agenda", label: "Agenda" },
    { href: "/billing", label: "Cobros" },
    { href: "/retention", label: "Retención" },
  ],
  TRAINER: [
    { href: "/agenda", label: "Agenda" },
    { href: "/brief", label: "Session Brief" },
    { href: "/members", label: "Socios" },
  ],
  RECEPTION: [
    { href: "/members", label: "Socios" },
    { href: "/agenda", label: "Agenda" },
    { href: "/billing", label: "Cobros" },
  ],
  MEMBER: [
    { href: "/portal", label: "Mi actividad" },
    { href: "/portal/agenda", label: "Reservar clase" },
  ],
  PLATFORM_ADMIN: [
    { href: "/dashboard", label: "Panel de control" },
    { href: "/audit", label: "Auditoría" },
  ],
};

export function canViewHealthData(role: Role): boolean {
  // Recepción y Admin plataforma NO ven datos de salud por defecto (A.2.4/A.2.5).
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER";
}

export function canEditAptitudeRules(role: Role): boolean {
  return role === "OWNER";
}

export function canManageBilling(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "RECEPTION";
}

export function canManageMembers(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "RECEPTION";
}

export function isStaffRole(role: Role): boolean {
  return role !== "MEMBER";
}

export function defaultRouteForRole(role: Role): string {
  // Siempre la primera entrada de su propia navegación: evita redirigir a
  // una ruta que ese rol no tiene permiso de ver (y el consiguiente bucle).
  return NAV_BY_ROLE[role][0]?.href ?? "/login";
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dirección (Sergio)",
  CENTER_DIRECTOR: "Dirección de centro",
  TRAINER: "Entrenador",
  RECEPTION: "Recepción",
  MEMBER: "Socio",
  PLATFORM_ADMIN: "Admin plataforma",
};

/** Título de cabecera para la ruta actual: coincidencia de prefijo más larga en NAV_BY_ROLE. */
export function getPageTitle(nav: { href: string; label: string }[], pathname: string): string {
  const match = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  return match?.label ?? "Training Zone";
}

export function sectionLabelForRole(role: Role): string {
  return role === "MEMBER" ? "Mi cuenta" : "Gestión";
}

export function footerLabelForRole(role: Role): string {
  return role === "MEMBER" ? "Portal del socio" : "MVP F0–F5";
}
