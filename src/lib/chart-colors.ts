// Paleta de marca Training Zone (beige/hueso/negro). Las barras
// destacadas/hover de las gráficas usan negro sobre relleno neutro cálido,
// no una serie categórica cicladas.
export const BRAND = {
  yellow: "#1d1d1c",
  ink: "#1d1d1c",
  inkSoft: "#c7bfad",
  inkCircle: "#1d1d1c",
};

export const STATUS = {
  good: "#4b5a22",
  warning: "#8a5a12",
  warningText: "#8a5a12",
  critical: "#8a3420",
};

export const INK = {
  primary: "#1d1d1c",
  secondary: "#5b5748",
  muted: "#8a8574",
  faint: "#a8a296",
  gridline: "#e7dfd2",
  baseline: "#d8ccb8",
  surface: "#ffffff",
};

export const MEMBER_STATE_COLOR: Record<string, string> = {
  ACTIVE: STATUS.good,
  DELINQUENT: STATUS.critical,
  FROZEN: STATUS.warning,
  CANCELLED: INK.faint,
  TRIAL: "#5c4a34",
  PROSPECT: "#5b4552",
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
  SEPA: "#3a3a34",
  BIZUM: STATUS.good,
  CASH: STATUS.warning,
  TRANSFER: INK.faint,
};

// BI-1: paleta categórica de marca para donuts (servicio/canal) — monocromática
// beige/negro, sin degradados. Orden fijo, nunca ciclado por rango; identidad
// siempre reforzada con leyenda + etiqueta directa (nunca solo color).
export const CATEGORICAL = ["#1d1d1c", "#5b5748", "#8a8574", "#3a3a34", "#a8a296", "#c7bfad"];
