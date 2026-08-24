// Paleta de marca Training Zone (beige/hueso/negro). Las barras
// destacadas/hover de las gráficas usan el sólido de contraste sobre relleno
// neutro cálido, no una serie categórica ciclada.
//
// Los valores son referencias a los tokens de `globals.css`, no hexadecimales:
// así los ejes, las rejillas y las series siguen el tema del usuario sin que
// haya que pasar el tema por props ni duplicar la paleta. SVG resuelve `var()`
// en `fill` y `stroke` igual que CSS. Único sitio donde no vale y por eso sigue
// con hexadecimales: el degradado del mapa de calor, que se pinta en canvas.
export const BRAND = {
  yellow: "var(--color-brand-ink)",
  ink: "var(--color-brand-ink)",
  inkSoft: "var(--color-brand-border-hover)",
  inkCircle: "var(--color-brand-ink-circle)",
};

/**
 * Colores semánticos. Desde el rediseño del panel (2026-08) ya NO son la
 * paleta de series de las gráficas —eso es `SERIES`, más abajo—: quedan para
 * los estados que sí son un juicio (aprobado, vencido, fallido) fuera del panel.
 */
export const STATUS = {
  good: "var(--color-good)",
  warning: "var(--color-warning)",
  warningText: "var(--color-warning-text)",
  critical: "var(--color-critical)",
};

export const INK = {
  primary: "var(--color-brand-text)",
  secondary: "var(--color-brand-text-2)",
  muted: "var(--color-brand-muted)",
  faint: "var(--color-brand-faint)",
  gridline: "var(--color-tz-sand)",
  baseline: "var(--color-brand-border)",
  surface: "var(--color-brand-card)",
};

/**
 * Rampa de acento del panel de dirección (rediseño 2026-08).
 *
 * El panel se veía monocromático: todas las series compartían el mismo negro y
 * el ojo no sabía dónde mirar. La regla nueva es una sola: **dorado sobre el
 * dato que hay que mirar**, tinta para la serie principal y arena/lino para lo
 * secundario. `--color-good` deja de usarse como color de serie.
 *
 * Siguen siendo referencias a tokens, no hexadecimales: el panel se invierte
 * entero con el tema sin pasar el tema por props (ver cabecera del fichero).
 */
export const SERIES = {
  /** El dato a mirar: mes en curso, líder de ocupación, pico del día, franja dominante. */
  gold: "var(--color-gold)",
  /** Acentos sobre oscuro, líneas de objetivo y de media, barra de score. */
  goldSoft: "var(--color-apta-gold)",
  /** Serie principal. */
  ink: "var(--color-brand-ink)",
  /** Segunda serie. */
  ink2: "var(--color-brand-text-2)",
  /** Serie secundaria. */
  sand: "var(--color-brand-border-hover)",
  /** Serie más tenue (colas del histograma, barras de relleno). */
  linen: "var(--color-brand-border)",
  /** Serie tenue intermedia. */
  faint: "var(--color-brand-faint)",
  /** Riesgo: morosos, bajas, no cerrado, estancados. */
  critical: "var(--color-critical)",
} as const;

export const MEMBER_STATE_COLOR: Record<string, string> = {
  ACTIVE: SERIES.gold,
  DELINQUENT: SERIES.critical,
  FROZEN: SERIES.goldSoft,
  CANCELLED: SERIES.faint,
  TRIAL: SERIES.sand,
  PROSPECT: SERIES.ink,
};

export const MEMBER_STATE_TONE: Record<string, "good" | "critical" | "warning" | "trial" | "prospect" | "neutral"> = {
  ACTIVE: "good",
  DELINQUENT: "critical",
  FROZEN: "warning",
  TRIAL: "trial",
  PROSPECT: "prospect",
  CANCELLED: "neutral",
};

export const PAYMENT_STATUS_TONE: Record<string, "good" | "critical" | "warning" | "neutral"> = {
  PAID: "good",
  FAILED: "critical",
  PENDING: "warning",
  REFUNDED: "neutral",
};

export const MEMBER_STATE_LABEL: Record<string, string> = {
  ACTIVE: "Activo",
  DELINQUENT: "Moroso",
  FROZEN: "Congelado",
  CANCELLED: "Baja",
  TRIAL: "Prueba",
  PROSPECT: "Prospecto",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CARD: "Tarjeta",
  BIZUM: "Bizum",
  CASH: "Efectivo",
  SEPA: "Domiciliación",
  TRANSFER: "Transferencia",
};

export const PAYMENT_METHOD_COLOR: Record<string, string> = {
  SEPA: SERIES.ink,
  CARD: SERIES.ink2,
  BIZUM: SERIES.gold,
  CASH: SERIES.goldSoft,
  TRANSFER: SERIES.faint,
};

// BI-1: paleta categórica de marca para donuts (servicio/canal) — tinta, dorado
// de marca y neutros cálidos, sin degradados. Orden fijo, nunca ciclado por rango; identidad
// siempre reforzada con leyenda + etiqueta directa (nunca solo color). La rampa
// va del sólido de contraste al borde más tenue, así que se invierte entera con
// el tema sin perder la separación entre escalones.
export const CATEGORICAL = [
  SERIES.ink,
  SERIES.ink2,
  SERIES.gold,
  SERIES.goldSoft,
  SERIES.sand,
  SERIES.linen,
];
