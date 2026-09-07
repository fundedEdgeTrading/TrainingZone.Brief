/**
 * Analítica sin cookies y eventos de conversión (E9-09).
 *
 * Punto de partida: cero analítica, cero Search Console, cero eventos. Todo el
 * trabajo de SEO de esta épica era, literalmente, opinión: no había forma de
 * saber si una página posiciona ni si un cambio ha servido de algo.
 *
 * **Por qué sin cookies y no GA4.** Una analítica sin cookies no trata datos
 * personales identificables ni almacena información en el terminal, así que no
 * exige consentimiento previo (Art. 22.2 LSSI) y la landing no arrastra banner.
 * Un banner en la única página comercial que existe cuesta conversión y añade
 * CLS por encima del hero. Si algún día se optase por GA4, tendría que ser con
 * Consent Mode v2 y una CMP con "rechazar todo" al mismo nivel visual que
 * "aceptar" (ver E10-22) — y entonces esta decisión habría que reabrirla.
 *
 * **Por qué por entorno.** El script no se codifica aquí: se configura. Sin
 * variables, `analyticsConfig()` devuelve `null` y no se carga nada, que es lo
 * correcto en desarrollo, en CI y en cualquier entorno de vista previa — donde
 * medir es contaminar la medición de producción.
 *
 * Módulo puro: ni Prisma, ni `next/*`, ni DOM.
 */

/** Lo justo del entorno que este módulo lee. Así se puede probar con un objeto suelto. */
export type EnvLike = Record<string, string | undefined>;

export type AnalyticsConfig = {
  /** Dominio con el que la analítica identifica el sitio. */
  domain: string;
  /** URL del script. Se deja configurable para poder autoalojarlo. */
  src: string;
};

/** Proveedor por defecto: Plausible, sin cookies y con el script alojado por ellos. */
const DEFAULT_SRC = "https://plausible.io/js/script.js";

/**
 * `null` cuando no hay analítica configurada. No se inventa un dominio por
 * defecto a propósito: enviar los eventos de un entorno de vista previa al
 * panel de producción es peor que no medir.
 */
export function analyticsConfig(env: EnvLike = process.env): AnalyticsConfig | null {
  const domain = env.NEXT_PUBLIC_ANALYTICS_DOMAIN?.trim();
  if (!domain) return null;
  const src = env.NEXT_PUBLIC_ANALYTICS_SRC?.trim() || DEFAULT_SRC;
  return { domain, src };
}

/**
 * Código de verificación de Google Search Console.
 *
 * La verificación buena es la de DNS (cubre el dominio entero, incluidos los
 * subdominios, y no se pierde al redesplegar). Esta meta se mantiene como
 * segunda vía porque es la que sobrevive a un cambio de proveedor de DNS.
 */
export function googleSiteVerification(env: EnvLike = process.env): string | undefined {
  return env.GOOGLE_SITE_VERIFICATION?.trim() || undefined;
}

/**
 * Los tres momentos que hay que poder contar. No son "clics": son intenciones
 * de compra o de contacto, que es lo que convierte una posición media en dinero.
 */
export const CONVERSIONS = {
  /** `/planes` → checkout de la licencia de Apta (Plano 1). */
  planCheckout: "checkout-plataforma",
  /** `/hazte-socio/[org]/[centro]` → checkout de cuota o bono del gimnasio (Plano 2). */
  centerCheckout: "checkout-centro",
  /** `/lead-form/[org]/[centro]` → lead entregado al centro. */
  lead: "lead-enviado",
} as const;

export type ConversionName = (typeof CONVERSIONS)[keyof typeof CONVERSIONS];

/** Atributo con el que se marca el formulario que dispara cada conversión. */
export const CONVERSION_ATTRIBUTE = "data-tz-conversion";

/** `true` si el valor del atributo es uno de los tres eventos declarados. */
export function isConversionName(value: string | null | undefined): value is ConversionName {
  return !!value && (Object.values(CONVERSIONS) as string[]).includes(value);
}
