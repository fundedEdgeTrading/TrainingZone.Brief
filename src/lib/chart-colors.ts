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

export const MEMBER_STATE_COLOR: Record<string, string> = {
  ACTIVE: STATUS.good,
  DELINQUENT: STATUS.critical,
  FROZEN: STATUS.warning,
  CANCELLED: INK.faint,
  TRIAL: "var(--color-trial)",
  PROSPECT: "var(--color-prospect)",
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
  CARD: BRAND.inkSoft,
  SEPA: "var(--color-brand-border-dark)",
  BIZUM: STATUS.good,
  CASH: STATUS.warning,
  TRANSFER: INK.faint,
};

// BI-1: paleta categórica de marca para donuts (servicio/canal) — monocromática
// beige/negro, sin degradados. Orden fijo, nunca ciclado por rango; identidad
// siempre reforzada con leyenda + etiqueta directa (nunca solo color). La rampa
// va del sólido de contraste al borde más tenue, así que se invierte entera con
// el tema sin perder la separación entre escalones.
export const CATEGORICAL = [
  "var(--color-brand-ink)",
  "var(--color-brand-text-2)",
  "var(--color-brand-muted)",
  "var(--color-brand-faint)",
  "var(--color-brand-border-hover)",
  "var(--color-brand-border)",
];
