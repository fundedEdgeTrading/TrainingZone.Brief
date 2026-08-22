import type { MeResponse } from "@/api/types";

/**
 * Destino tras el login, espejo de `defaultRouteForRole` (src/lib/rbac.ts) más
 * el gate de compra del handoff: el socio sin ningún bono vivo entra al
 * catálogo del centro (A2) en lugar de a las tabs.
 */
export function homeRouteFor(user: MeResponse): string {
  if (user.role === "MEMBER" && user.member && !user.member.hasActiveMembership) return "/onboarding/planes";
  return "/(tabs)";
}

export function needsMembershipGate(user: MeResponse): boolean {
  return user.role === "MEMBER" && Boolean(user.member) && !user.member?.hasActiveMembership;
}
