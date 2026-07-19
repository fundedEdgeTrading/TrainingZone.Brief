// Paleta de marca Training Zone (amarillo/negro). El amarillo se reserva
// como acento (barra destacada, hover, CTA); el relleno neutro de las
// gráficas es negro suave, no una serie categórica cicladas.
export const BRAND = {
  yellow: "#fff03e",
  ink: "#111110",
  inkSoft: "#1f1f1c",
  inkCircle: "#1c1c19",
};

export const STATUS = {
  good: "#0b8f3f",
  warning: "#e6b325",
  warningText: "#b7791a",
  critical: "#c9342f",
};

export const INK = {
  primary: "#111110",
  secondary: "#3a3a34",
  muted: "#8a897f",
  faint: "#a5a49a",
  gridline: "#f0efe9",
  baseline: "#e6e5df",
  surface: "#ffffff",
};

export const MEMBER_STATE_COLOR: Record<string, string> = {
  ACTIVE: STATUS.good,
  DELINQUENT: STATUS.critical,
  FROZEN: STATUS.warning,
  CANCELLED: INK.faint,
  TRIAL: "#2a78d6",
  PROSPECT: "#6b5bc7",
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
