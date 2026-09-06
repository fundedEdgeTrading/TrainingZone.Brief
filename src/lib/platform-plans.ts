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
  /**
   * E6-04: cupo mensual de generaciones de `ia_programacion`, solo para el
   * plan que la vende con límite (Avanzado). `null`/ausente = sin cupo propio
   * (Élite, sin límite de uso; el resto, sin la feature).
   */
  aiGenerationsPerMonth?: number;
  /**
   * E6-04: por encima de `maxCenters` no hay más tier que vender — se negocia
   * precio a medida en vez de forzar a un gimnasio grande a un límite fijo.
   */
  customPricingAboveLimit?: boolean;
};

/** Los diferenciadores de Apta (G.1/G.2/G.3 + BI) van en Avanzado: es el tier al que se quiere llevar a todo el mundo. */
const AVANZADO_FEATURES: PlatformFeature[] = [
  "salud_aptitud",
  "retencion",
  "feedback_direccion",
  "bi_avanzado",
  "exportaciones",
  // E6-04/D-P5: la IA entra en Avanzado con cupo (ver `aiGenerationsPerMonth`
  // más abajo), en vez de reservarse para Élite — es el único módulo con
  // coste marginal real (~0,18 $/generación) y ahí es donde tenía que
  // gatearse de verdad (E6-03).
  "ia_programacion",
];

/** Cupo mensual de generaciones de IA del plan Avanzado (E6-04). */
export const AVANZADO_AI_GENERATIONS_PER_MONTH = 20;

export const PLATFORM_PLANS: PlatformPlan[] = [
  {
    code: "esencial_mes",
    tier: "esencial",
    name: "Esencial",
    interval: "month",
    priceLabel: "99 €/mes",
    maxCenters: 1,
    features: [],
    priceEnvVar: "STRIPE_PRICE_ESENCIAL_MES",
  },
  {
    code: "esencial_ano",
    tier: "esencial",
    name: "Esencial",
    interval: "year",
    priceLabel: "990 €/año",
    maxCenters: 1,
    features: [],
    priceEnvVar: "STRIPE_PRICE_ESENCIAL_ANO",
  },
  {
    code: "avanzado_mes",
    tier: "avanzado",
    name: "Avanzado",
    interval: "month",
    priceLabel: "129 €/mes",
    maxCenters: 3,
    features: AVANZADO_FEATURES,
    priceEnvVar: "STRIPE_PRICE_AVANZADO_MES",
    recommended: true,
    aiGenerationsPerMonth: AVANZADO_AI_GENERATIONS_PER_MONTH,
  },
  {
    code: "avanzado_ano",
    tier: "avanzado",
    name: "Avanzado",
    interval: "year",
    priceLabel: "1.290 €/año",
    maxCenters: 3,
    features: AVANZADO_FEATURES,
    priceEnvVar: "STRIPE_PRICE_AVANZADO_ANO",
    recommended: true,
    aiGenerationsPerMonth: AVANZADO_AI_GENERATIONS_PER_MONTH,
  },
  {
    // Élite ya no vende "centros ilimitados": ahí es donde vive el coste real
    // de soporte, y regalarlo por encima de Avanzado + IA era el único
    // diferenciador del tier. Por encima de 10 centros, precio a medida.
    code: "elite_mes",
    tier: "elite",
    name: "Élite",
    interval: "month",
    priceLabel: "279 €/mes",
    maxCenters: 10,
    features: [...AVANZADO_FEATURES],
    priceEnvVar: "STRIPE_PRICE_ELITE_MES",
    customPricingAboveLimit: true,
  },
  {
    code: "elite_ano",
    tier: "elite",
    name: "Élite",
    interval: "year",
    priceLabel: "2.790 €/año",
    maxCenters: 10,
    features: [...AVANZADO_FEATURES],
    priceEnvVar: "STRIPE_PRICE_ELITE_ANO",
    customPricingAboveLimit: true,
  },
  {
    // Funcionalidad de Avanzado a perpetuidad, SIN cupo de IA propio a
    // propósito: la IA es el único módulo con coste variable por uso, e
    // incluir un cupo mensual en un pago único es exactamente como envejecen
    // mal las ofertas de por vida.
    code: "fundador",
    tier: "fundador",
    name: "Fundador",
    interval: "lifetime",
    priceLabel: "3.990 € pago único",
    maxCenters: 3,
    features: AVANZADO_FEATURES.filter((f) => f !== "ia_programacion"),
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

/**
 * E6-08: precio mensualizado en céntimos, derivado de `priceLabel` para el
 * MRR agregado de `/apta`. Es una aproximación de back-office (redondea el
 * importe mostrado, que ya es solo presentación) — el cobro real lo manda
 * Stripe. `null` para Fundador: es pago único, no ingreso recurrente.
 */
export function monthlyPriceCents(plan: PlatformPlan): number | null {
  if (plan.interval === "lifetime") return null;
  const match = plan.priceLabel.match(/([\d.,]+)\s*€/);
  if (!match) return null;
  const amount = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  const monthly = plan.interval === "year" ? amount / 12 : amount;
  return Math.round(monthly * 100);
}

/** El `price_…` de Stripe, resuelto del entorno. `null` = plan no vendible aquí y ahora. */
export function resolveStripePriceId(plan: PlatformPlan): string | null {
  return process.env[plan.priceEnvVar] || null;
}

export function fundadorEnabled() {
  if (process.env.PLATFORM_PLAN_FUNDADOR_ENABLED !== "true") return false;
  const closesAt = fundadorClosesAt();
  if (closesAt && Date.now() >= closesAt.getTime()) return false;
  return true;
}

export function fundadorMaxSeats() {
  return Number(process.env.PLATFORM_PLAN_FUNDADOR_MAX_SEATS) || 0;
}

/**
 * E6-04: "la escasez es el producto" — un lifetime sin fecha no vende. La
 * fecha de cierre es configuración de entorno, igual que el cupo: cuando
 * llegue se apaga desde ahí, sin desplegar código.
 */
export function fundadorClosesAt(): Date | null {
  const raw = process.env.PLATFORM_PLAN_FUNDADOR_CLOSES_AT;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
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
