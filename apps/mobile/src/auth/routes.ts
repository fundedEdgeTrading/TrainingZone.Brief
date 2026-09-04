import type { Href } from "expo-router";
import type { MeResponse, Role } from "@/api/types";

/**
 * Destino tras el login, espejo de `defaultRouteForRole` (src/lib/rbac.ts) más
 * el gate de compra del handoff: el socio sin ningún bono vivo entra al
 * catálogo del centro (A2) en lugar de a las tabs.
 */
export function homeRouteFor(user: MeResponse): Href {
  if (user.role === "MEMBER" && user.member && !user.member.hasActiveMembership) return "/onboarding/planes";
  return "/(tabs)";
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

/**
 * Quién tiene bandeja de tareas. Mismo conjunto que acepta `/tasks` en la API:
 * el soporte de plataforma queda fuera a propósito —entra a diagnosticar, no a
 * repartir trabajo dentro del gimnasio de un cliente— y sin este predicado la
 * app le pediría una bandeja que el servidor rechaza con un 403.
 */
export function hasTaskInbox(role: Role): boolean {
  return role !== "MEMBER" && role !== "PLATFORM_ADMIN";
}
