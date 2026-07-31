/**
 * Catálogo comercial de Apta (Plano 1: Apta → gimnasios). Es SOLO DATOS: no
 * consulta base de datos, no decide permisos y no habla con Stripe. La política
 * («¿tiene esta organización esta funcionalidad?») vive en `lib/entitlements.ts`
 * y la pasarela en `lib/platform-billing.ts`. Añadir o cambiar un tier se hace
 * aquí y en ningún otro sitio.
 *
 * D-8 (decisión de dirección, cerrada): el eje de precio es el NÚMERO DE
 * CENTROS, nunca el de socios — escala con el valor entregado y con nuestro
 * coste, y no penaliza justo lo que queremos que el gimnasio haga crecer.
 */
import { isPlatformStripeConfigured } from "@/lib/stripe";

/** Capacidades gateables por plan. El registro de datos NO se gatea (ver `entitlements.ts`). */
export type PlatformFeature =
  | "salud_aptitud" // Semáforo de Aptitud, Session Brief y Debrief
  | "retencion" // motor de retención y alertas
  | "feedback_direccion" // contraste cliente ⟷ entrenador
  | "bi_avanzado" // panel de control completo
  | "exportaciones" // exportar datos y auditoría avanzada
  | "ia_programacion"; // rutinas por IA — único módulo con coste marginal real

export type PlanTier = "esencial" | "avanzado" | "elite" | "fundador";

export type PlatformPlanCode =
  | "esencial_mes"
  | "esencial_ano"
  | "avanzado_mes"
  | "avanzado_ano"
  | "elite_mes"
  | "elite_ano"
  | "fundador";

export type PlatformPlan = {
  code: PlatformPlanCode;
  tier: PlanTier;
  name: string;
  interval: "month" | "year" | "lifetime";
  priceLabel: string; // solo presentación: el importe real lo manda Stripe
  maxCenters: number | null; // null = sin límite
  features: PlatformFeature[];
  /**
   * Nombre de la variable de entorno con el `price_…` de Stripe. Los
   * identificadores de precio cambian entre test y live: son configuración de
   * entorno, no código (RB-PLAN-001).
   */
  priceEnvVar: string;
  recommended?: boolean;
  /** Oferta limitada: además del precio necesita interruptor y cupo. */
  limitedOffer?: boolean;
};

/** Los diferenciadores de Apta (G.1/G.2/G.3 + BI) van en Avanzado: es el tier al que se quiere llevar a todo el mundo. */
const AVANZADO_FEATURES: PlatformFeature[] = [
  "salud_aptitud",
  "retencion",
  "feedback_direccion",
  "bi_avanzado",
  "exportaciones",
];

export const PLATFORM_PLANS: PlatformPlan[] = [
  {
    code: "esencial_mes",
    tier: "esencial",
    name: "Esencial",
    interval: "month",
    priceLabel: "79 €/mes",
    maxCenters: 1,
    features: [],
    priceEnvVar: "STRIPE_PRICE_ESENCIAL_MES",
  },
  {
    code: "esencial_ano",
    tier: "esencial",
    name: "Esencial",
    interval: "year",
    priceLabel: "790 €/año",
    maxCenters: 1,
    features: [],
    priceEnvVar: "STRIPE_PRICE_ESENCIAL_ANO",
  },
  {
    code: "avanzado_mes",
    tier: "avanzado",
    name: "Avanzado",
    interval: "month",
    priceLabel: "149 €/mes",
    maxCenters: 3,
    features: AVANZADO_FEATURES,
    priceEnvVar: "STRIPE_PRICE_AVANZADO_MES",
    recommended: true,
  },
  {
    code: "avanzado_ano",
    tier: "avanzado",
    name: "Avanzado",
    interval: "year",
    priceLabel: "1.490 €/año",
    maxCenters: 3,
    features: AVANZADO_FEATURES,
    priceEnvVar: "STRIPE_PRICE_AVANZADO_ANO",
    recommended: true,
  },
  {
    code: "elite_mes",
    tier: "elite",
    name: "Élite",
    interval: "month",
    priceLabel: "279 €/mes",
    maxCenters: null,
    features: [...AVANZADO_FEATURES, "ia_programacion"],
    priceEnvVar: "STRIPE_PRICE_ELITE_MES",
  },
  {
    code: "elite_ano",
    tier: "elite",
    name: "Élite",
    interval: "year",
    priceLabel: "2.790 €/año",
    maxCenters: null,
    features: [...AVANZADO_FEATURES, "ia_programacion"],
    priceEnvVar: "STRIPE_PRICE_ELITE_ANO",
  },
  {
    // Funcionalidad de Avanzado a perpetuidad, SIN IA a propósito: la IA es el
    // único módulo con coste variable por uso, e incluirla en un pago único es
    // exactamente como envejecen mal las ofertas de por vida.
    code: "fundador",
    tier: "fundador",
    name: "Fundador",
    interval: "lifetime",
    priceLabel: "3.990 € pago único",
    maxCenters: 3,
    features: AVANZADO_FEATURES,
    priceEnvVar: "STRIPE_PRICE_FUNDADOR",
    limitedOffer: true,
  },
];

export const FEATURE_LABEL: Record<PlatformFeature, string> = {
  salud_aptitud: "Salud y Semáforo de Aptitud (Session Brief y Debrief)",
  retencion: "Motor de retención y alertas",
  feedback_direccion: "Feedback de dirección (cliente ⟷ entrenador)",
  bi_avanzado: "Panel de control avanzado",
  exportaciones: "Exportaciones y auditoría avanzada",
  ia_programacion: "Programación de rutinas por IA",
};

/** Lo que incluye cualquier plan, sin excepción. Se enseña en /planes para que el gateado se entienda. */
export const CORE_FEATURES = [
  "Socios, fichas y consentimientos",
  "Agenda, reservas y control de asistencia",
  "Cobros y control de morosidad",
  "Portal del socio y app móvil",
  "CRM de leads y anuncios",
  "Organización, centros, personal y RRHH",
];

export function getPlatformPlan(code: string | null | undefined): PlatformPlan | null {
  if (!code) return null;
  return PLATFORM_PLANS.find((p) => p.code === code) ?? null;
}

/** El `price_…` de Stripe, resuelto del entorno. `null` = plan no vendible aquí y ahora. */
export function resolveStripePriceId(plan: PlatformPlan): string | null {
  return process.env[plan.priceEnvVar] || null;
}

export function fundadorEnabled() {
  return process.env.PLATFORM_PLAN_FUNDADOR_ENABLED === "true";
}

export function fundadorMaxSeats() {
  return Number(process.env.PLATFORM_PLAN_FUNDADOR_MAX_SEATS) || 0;
}

/**
 * Sin `STRIPE_SECRET_KEY` no hay pago real posible en este entorno. En vez de
 * dejar `/planes` vacía (nadie puede ver el producto ni hacer una demo del
 * alta), se activa un modo demo: se enseña el catálogo completo y el pago se
 * sustituye por una pantalla que lo deja explícito, sin fingir un cobro real.
 */
export function isDemoModeActive() {
  return !isPlatformStripeConfigured();
}

/**
 * Planes comprables en este entorno: los que tienen precio configurado, más el
 * interruptor de la oferta limitada. Sin precios no se muestran botones muertos.
 * En modo demo se enseña el catálogo entero, porque no hay precios reales que
 * resolver — el pago tampoco es real (ver `isDemoModeActive`).
 */
export function listPurchasablePlans(): PlatformPlan[] {
  if (isDemoModeActive()) {
    return PLATFORM_PLANS.filter((plan) => !plan.limitedOffer || fundadorEnabled());
  }
  return PLATFORM_PLANS.filter((plan) => {
    if (!resolveStripePriceId(plan)) return false;
    if (plan.limitedOffer && !fundadorEnabled()) return false;
    return true;
  });
}
