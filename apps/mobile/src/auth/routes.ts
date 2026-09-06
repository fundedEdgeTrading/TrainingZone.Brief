import type { Href } from "expo-router";
import type { MeResponse, Role } from "@/api/types";

/**
 * Pestañas de cada rol y ruta de aterrizaje. Las dos cosas viven aquí y no en
 * `(tabs)/_layout.tsx` porque tenían que ser LA MISMA lista: el layout decidía
 * qué pestañas se ven y `homeRouteFor` mandaba a todo el mundo a `/(tabs)`, que
 * es la ruta índice del grupo — o sea, `(tabs)/index.tsx`, el «Hoy» del socio.
 *
 * Con eso, quien entraba como entrenador (o como dirección, o como recepción)
 * aterrizaba en la pantalla del socio, que pide `/portal/activity` y
 * `/portal/agenda`; el servidor las responde con 403 a quien no es socio, así
 * que la primera pantalla tras el login era «No se pudo cargar tu día» y ni
 * siquiera había una pestaña marcada, porque `index` va oculta para esos roles.
 *
 * Ahora cada rol aterriza en SU primera pestaña, y `TAB_HREF` cubre todos los
 * nombres de pestaña, así que añadir una a `TABS_BY_ROLE` sin darle ruta no
 * compila.
 */
export type TabName =
  | "index"
  | "agenda"
  | "sesiones"
  | "bonos"
  | "evolucion"
  | "consumo"
  | "panel"
  | "brief"
  | "feedback"
  | "staff-agenda"
  | "mis-socios"
  | "tareas"
  | "leads"
  | "aforo"
  | "dashboard"
  | "socios"
  | "productos"
  | "anuncios"
  | "organizacion"
  | "notificaciones"
  | "mas"
  | "perfil";

/**
 * Navegación por rol. CINCO pestañas por rol elegidas por frecuencia de uso, y
 * una quinta —«Más»— que es un índice real del resto de la app, con contadores.
 *
 * La primera de la lista es, además, la pantalla de aterrizaje del rol.
 *
 * **Recorte de la app a dos roles (D-M4, E13-01)**: la tabla solo declara
 * `MEMBER` y `TRAINER`/`TRAINER_ADMIN`. Los otros cinco roles del dominio
 * (dirección de plataforma, dirección de organización, director de centro,
 * recepción, RRHH) tenían aquí pestañas para pantallas de gestión con 53
 * endpoints detrás que nadie usaba desde el móvil — la web ya les da toda su
 * superficie. `isAppSupportedRole` corta el acceso a `(tabs)/_layout.tsx`
 * ANTES de que se pregunte por sus pestañas, así que no hace falta una fila
 * aquí para ellos.
 */
export const TABS_BY_ROLE: Partial<Record<Role, TabName[]>> = {
  MEMBER: ["index", "agenda", "sesiones", "evolucion", "mas"],
  TRAINER: ["panel", "staff-agenda", "mis-socios", "feedback", "mas"],
  // El Entrenador Admin ve lo mismo; lo que le distingue (aforo, ajuste de
  // saldo al descartar) aparece DENTRO de esas pantallas según su permiso, no
  // como una pestaña más: su día a día es el mismo que el del entrenador.
  TRAINER_ADMIN: ["panel", "staff-agenda", "mis-socios", "feedback", "mas"],
};

/** Ruta de cada pestaña. `index` es la ruta índice del grupo, sin nombre propio. */
const TAB_HREF: Record<TabName, Href> = {
  index: "/(tabs)",
  agenda: "/agenda",
  sesiones: "/sesiones",
  bonos: "/bonos",
  evolucion: "/evolucion",
  consumo: "/consumo",
  panel: "/panel",
  brief: "/brief",
  feedback: "/feedback",
  "staff-agenda": "/staff-agenda",
  "mis-socios": "/mis-socios",
  tareas: "/tareas",
  leads: "/leads",
  aforo: "/aforo",
  dashboard: "/dashboard",
  socios: "/socios",
  productos: "/productos",
  anuncios: "/anuncios",
  organizacion: "/organizacion",
  notificaciones: "/notificaciones",
  mas: "/mas",
  perfil: "/perfil",
};

/** Pestañas visibles de un rol. Un rol sin ninguna se queda al menos con «Más». */
export function tabsFor(role: Role): TabName[] {
  const tabs = TABS_BY_ROLE[role];
  return tabs?.length ? tabs : ["mas"];
}

export function isTab(role: Role, tab: TabName): boolean {
  return tabsFor(role).includes(tab);
}

/** La pantalla con la que se abre la app para ese rol: su primera pestaña. */
export function homeTabFor(role: Role): Href {
  return TAB_HREF[tabsFor(role)[0]];
}

/**
 * Destino tras el login, espejo de `defaultRouteForRole` (src/lib/rbac.ts) más
 * el gate de compra del handoff: el socio sin ningún bono vivo entra al
 * catálogo del centro (A2) en lugar de a las tabs.
 */
export function homeRouteFor(user: MeResponse): Href {
  if (needsMembershipGate(user)) return "/onboarding/planes";
  return homeTabFor(user.role);
}

export function needsMembershipGate(user: MeResponse): boolean {
  return user.role === "MEMBER" && Boolean(user.member) && !user.member?.hasActiveMembership;
}

/**
 * Roles que llevan la app del entrenador. El Entrenador Admin entra aquí: en la
 * app ve las mismas pantallas, y lo que le distingue (aforo de clases, ajuste
 * del saldo al descartar) se decide dentro de cada pantalla por permiso.
 */
export function isTrainerRole(role: Role): boolean {
  return role === "TRAINER" || role === "TRAINER_ADMIN";
}

/**
 * Recorte de la app a dos roles (D-M4, E13-01): en la app móvil solo entran
 * socio y entrenador (Entrenador Admin incluido, porque su día a día es el
 * mismo que el del entrenador — ver `isTrainerRole`). Dirección de plataforma,
 * dirección de organización, director de centro, recepción y RRHH conservan
 * toda su superficie en la WEB, que no se recorta.
 */
export function isAppSupportedRole(role: Role): boolean {
  return role === "MEMBER" || isTrainerRole(role);
}

/** Permisos que la app consulta para enseñar u ocultar acciones (espejo de src/lib/rbac.ts). */
export function canManageCenterCapacity(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER_ADMIN";
}

export function canAssignTasks(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER_ADMIN";
}

export function canManageLeads(role: Role): boolean {
  return (
    role === "OWNER" ||
    role === "CENTER_DIRECTOR" ||
    role === "RECEPTION" ||
    role === "TRAINER" ||
    role === "TRAINER_ADMIN"
  );
}

export function canManageEpSlots(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "TRAINER" || role === "TRAINER_ADMIN";
}

/** Quién publica anuncios del centro (mismos roles que acepta `/admin/anuncios`). */
export function canManageAnnouncements(role: Role): boolean {
  return role === "OWNER" || role === "CENTER_DIRECTOR" || role === "PLATFORM_ADMIN";
}

/**
 * Quién tiene bandeja de tareas. Mismo conjunto que acepta `/tasks` en la API:
 * el soporte de plataforma queda fuera a propósito —entra a diagnosticar, no a
 * repartir trabajo dentro del gimnasio de un cliente— y sin este predicado la
 * app le pediría una bandeja que el servidor rechaza con un 403.
 */
export function hasTaskInbox(role: Role): boolean {
  return role !== "MEMBER" && role !== "PLATFORM_ADMIN";
}
