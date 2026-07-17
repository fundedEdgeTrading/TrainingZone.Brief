// Paleta validada (dataviz skill): orden categórico fijo, nunca ciclado.
export const CATEGORICAL = {
  blue: "#2a78d6",
  green: "#008300",
  magenta: "#e87ba4",
  yellow: "#eda100",
  aqua: "#1baf7a",
  orange: "#eb6834",
  violet: "#4a3aa7",
  red: "#e34948",
};

export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
};

export const INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  gridline: "#e1e0d9",
  baseline: "#c3c2b7",
  surface: "#fcfcfb",
};

export const MEMBER_STATE_COLOR: Record<string, string> = {
  ACTIVE: STATUS.good,
  DELINQUENT: STATUS.critical,
  FROZEN: STATUS.warning,
  CANCELLED: INK.muted,
  TRIAL: CATEGORICAL.blue,
  PROSPECT: CATEGORICAL.violet,
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
  CARD: CATEGORICAL.blue,
  BIZUM: CATEGORICAL.green,
  CASH: CATEGORICAL.yellow,
  SEPA: CATEGORICAL.aqua,
  TRANSFER: CATEGORICAL.orange,
};
