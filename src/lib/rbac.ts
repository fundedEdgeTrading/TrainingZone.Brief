import type { Role } from "@prisma/client";

/**
 * Matriz de permisos (A.2.5). Ámbito: rol x módulo.
 * "own" = solo su propio ámbito (sus sesiones, su ficha); "center" = su
 * centro; "org" = toda la organización.
 */
export type NavSection =
  | "Vista general"
  | "Comercial"
  | "Operativa del centro"
  | "Salud y aptitud"
  | "Administración"
  | "Mi cuenta";

export type NavItem = { href: string; label: string; section: NavSection };

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  OWNER: [
    { href: "/dashboard", label: "Panel de control", section: "Vista general" },
    { href: "/feedback", label: "Feedback", section: "Vista general" },
    { href: "/leads", label: "Leads", section: "Comercial" },
    { href: "/offers", label: "Ofertas", section: "Comercial" },
    { href: "/members", label: "Socios", section: "Operativa del centro" },
    { href: "/agenda", label: "Agenda", section: "Operativa del centro" },
    { href: "/billing", label: "Cobros", section: "Operativa del centro" },
    { href: "/retention", label: "Retención", section: "Operativa del centro" },
    { href: "/health/aptitude-rules", label: "Reglas de aptitud", section: "Salud y aptitud" },
    { href: "/health/reference-ranges", label: "Rangos de composición", section: "Salud y aptitud" },
    { href: "/rrhh", label: "RRHH", section: "Administración" },
    { href: "/organization", label: "Organización", section: "Administración" },
    { href: "/audit", label: "Auditoría", section: "Administración" },
  ],
  CENTER_DIRECTOR: [
    { href: "/dashboard", label: "Panel de control", section: "Vista general" },
    { href: "/feedback", label: "Feedback", section: "Vista general" },
    { href: "/leads", label: "Leads", section: "Comercial" },
    { href: "/offers", label: "Ofertas", section: "Comercial" },
    { href: "/members", label: "Socios", section: "Operativa del centro" },
    { href: "/agenda", label: "Agenda", section: "Operativa del centro" },
    { href: "/billing", label: "Cobros", section: "Operativa del centro" },
    { href: "/retention", label: "Retención", section: "Operativa del centro" },
    { href: "/rrhh", label: "RRHH", section: "Administración" },
  ],
  TRAINER: [
    { href: "/trainer", label: "Mi panel", section: "Vista general" },
    { href: "/brief", label: "Session Brief", section: "Vista general" },
    { href: "/leads", label: "Leads", section: "Comercial" },
    { href: "/offers", label: "Ofertas", section: "Comercial" },
    { href: "/members", label: "Socios", section: "Operativa del centro" },
    { href: "/agenda", label: "Agenda", section: "Operativa del centro" },
    { href: "/rrhh", label: "RRHH", section: "Administración" },
  ],
  RECEPTION: [
    { href: "/leads", label: "Leads", section: "Comercial" },
    { href: "/members", label: "Socios", section: "Operativa del centro" },
    { href: "/agenda", label: "Agenda", section: "Operativa del centro" },
    { href: "/billing", label: "Cobros", section: "Operativa del centro" },
  ],
  MEMBER: [
    { href: "/portal", label: "Mi actividad", section: "Mi cuenta" },
    { href: "/portal/agenda", label: "Reservar clase", section: "Mi cuenta" },
    { href: "/portal/evolucion", label: "Mi evolución", section: "Mi cuenta" },
    { href: "/portal/plan", label: "Mi plan", section: "Mi cuenta" },
    { href: "/portal/chat", label: "Chat", section: "Mi cuenta" },
  ],
  HR_MANAGER: [
    { href: "/organization", label: "Organización", section: "Administración" },
    { href: "/rrhh", label: "RRHH", section: "Administración" },
  ],
  PLATFORM_ADMIN: [
    { href: "/dashboard", label: "Panel de control", section: "Vista general" },
    { href: "/organization", label: "Organización", section: "Administración" },
    { href: "/audit", label: "Auditoría", section: "Administración" },
  ],
};

// Orden canónico de secciones (las vacías se omiten al render).
export const NAV_SECTION_ORDER: NavSection[] = [
  "Vista general",
  "Comercial",
  "Operativa del centro",
  "Salud y aptitud",
  "Administración",
  "Mi cuenta",
];

export function groupNav(nav: NavItem[]) {
  return NAV_SECTION_ORDER.map((section) => ({
    section,
    items: nav.filter((i) => i.section === section),
  })).filter((g) => g.items.length > 0);
}

export function canViewHealthData(role: Role): boolean {
  // Recepción, RRHH y Admin plataforma NO ven datos de salud por defecto (A.2.4/A.2.5).
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER";
}

export function canEditHealthData(role: Role): boolean {
  // Alta/resolución de lesiones y condiciones: mismo ámbito que la lectura
  // (entrenador asignado + dirección). Recepción y RRHH quedan fuera.
  return canViewHealthData(role);
}

// Gestión de personal e imputación a centros (RRHH además de dirección/plataforma).
export function canManageStaff(role: Role): boolean {
  return role === "OWNER" || role === "PLATFORM_ADMIN" || role === "HR_MANAGER";
}

// Alta de organización y centros: solo administración de la organización.
export function canManageOrg(role: Role): boolean {
  return role === "OWNER" || role === "PLATFORM_ADMIN";
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

// Importación masiva de socios desde CSV (RB-IMPORT): EXCLUSIVO de dirección
// (dirección de la organización y dirección de centro) — recepción queda fuera,
// a diferencia del alta individual.
export function canImportMembers(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

export function isStaffRole(role: Role): boolean {
  return role !== "MEMBER";
}

// F8 — CRM comercial de leads.
export function canManageLeads(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "RECEPTION" || role === "TRAINER";
}

// F11/RB-AGENDA-006 — crear/editar/publicar franjas autorreservables de EP.
export function canManageEpSlots(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER";
}

// F14/RB-RRHH-013 — aprobar (luz verde) ofertas personalizadas.
export function canApproveOffers(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

// F14/RB-RRHH-013 — proponer/elevar ofertas a dirección.
export function canProposeOffers(role: Role): boolean {
  return role === "TRAINER" || role === "OWNER" || role === "CENTER_DIRECTOR";
}

// F14/RB-RRHH-012 — valoraciones de entrenadores: EXCLUSIVO dirección, nunca el propio entrenador.
export function canViewTrainerRatings(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR";
}

// F13/RB-RRHH-003 — buzón de propuestas: dirección + RRHH lo revisan.
export function canReviewStaffProposals(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "HR_MANAGER";
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
  HR_MANAGER: "RRHH",
  PLATFORM_ADMIN: "Admin plataforma",
};

/** Título de cabecera para la ruta actual: coincidencia de prefijo más larga en NAV_BY_ROLE. */
export function getPageTitle(nav: { href: string; label: string }[], pathname: string): string {
  const match = [...nav]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
  return match?.label ?? "Training Zone";
}

export function footerLabelForRole(role: Role): string {
  return role === "MEMBER" ? "Portal del socio" : "MVP F0–F5";
}
