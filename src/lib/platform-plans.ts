import type { Organization } from "@prisma/client";

/**
 * Catálogo de planes de plataforma (Apta → gimnasios, A.5/D-8). El código fija
 * el MECANISMO (plano / tiers con funcionalidades / lifetime), no el precio:
 * la elección concreta de tiers y precios es una decisión de dirección que se
 * resuelve rellenando este array (o migrándolo a una tabla `PlatformPlan` si
 * el catálogo crece), sin tocar el resto del código.
 */
export type PlatformFeature = "ia_programacion" | "bi_avanzado" | "multicentro";

export type PlatformPlan = {
  code: string;
  name: string;
  stripePriceId: string | null; // null = plan aún sin precio de Stripe configurado
  interval: "month" | "year" | "lifetime";
  features: PlatformFeature[];
};

/**
 * Catálogo vacío/configurable a propósito (D-8): dirección no ha cerrado
 * tiers/precios todavía. Rellenar aquí cuando lo haga, sin cambios de código
 * en checkout, webhook ni gating — todos leen este array.
 */
export const PLATFORM_PLANS: PlatformPlan[] = [];

export function getPlatformPlan(code: string | null | undefined): PlatformPlan | null {
  if (!code) return null;
  return PLATFORM_PLANS.find((p) => p.code === code) ?? null;
}

/** RB-PLAT-006: funciones premium se gatean por esto, no solo por platformStatus. */
export function orgHasFeature(org: Pick<Organization, "platformPlan">, feature: PlatformFeature): boolean {
  const plan = getPlatformPlan(org.platformPlan);
  if (!plan) return false;
  return plan.features.includes(feature);
}
