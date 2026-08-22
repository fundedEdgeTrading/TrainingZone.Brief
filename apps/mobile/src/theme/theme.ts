import { useColorScheme } from "react-native";

// Tokens de marca (docs/BRANDING.md) portados a React Native. Misma paleta
// que src/app/globals.css de la web, con equivalentes claro/oscuro.
//
// Handoff "App móvil premium": la piel oscura es la de por defecto — la clara
// solo entra si el sistema lo pide explícitamente (useColorScheme === "light").
const palette = {
  black: "#1D1D1C",
  bone: "#F4F0E8",
  sand: "#E7DFD2",
  linen: "#D8CCB8",
  white: "#FFFFFF",
  text2: "#5B5748",
  muted: "#8A8574",
  good: "#4B5A22",
  goodBg: "#E4E8D2",
  warning: "#8A5A12",
  warningBg: "#F3E3C0",
  critical: "#8A3420",
  criticalBg: "#F4DDD2",
  inkSoft: "#2A2A27",
  inkBorder: "#33322C",
  gold: "#C8AB72",
  goldSoft: "#E3CFA2",
};

export type Theme = {
  mode: "light" | "dark";
  background: string;
  surface: string;
  surfaceAlt: string;
  /** Superficie de hojas, listas internas y timeline (un punto por encima del fondo). */
  sheet: string;
  border: string;
  /** Separador interno de tarjeta: más apagado que `border`. */
  separator: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** Texto de apoyo mínimo (leyendas de cuenta atrás, marcadores). */
  textFaint: string;
  ink: string;
  inkText: string;
  good: string;
  goodBg: string;
  warning: string;
  warningBg: string;
  critical: string;
  criticalBg: string;
  /** Acento dorado de marca (spotlight, anillos de progreso, chips destacados). */
  gold: string;
  goldSoft: string;
  /** Dorado legible como texto sobre `goldBg` (en claro el dorado puro no cumple AA). */
  goldText: string;
  goldBg: string;
  /** Fondo del héroe con degradado tinta→tinta suave (mismo tratamiento que .tz-card-sheen en web). */
  heroGradient: [string, string];
  /** Manchas "aurora" translúcidas sobre el héroe. */
  auroraGold: string;
  auroraLinen: string;
  shadowColor: string;
  /** Textos sobre tinta (héroe): iguales en ambas pieles, el héroe nunca se aclara. */
  onInk: { text: string; secondary: string; muted: string };
};

const onInk = { text: "#F4F0E8", secondary: "#C7C2B4", muted: "#9C9686" };

const light: Theme = {
  mode: "light",
  background: palette.bone,
  surface: palette.white,
  surfaceAlt: palette.sand,
  sheet: palette.white,
  border: palette.linen,
  separator: palette.sand,
  text: palette.black,
  textSecondary: palette.text2,
  textMuted: palette.muted,
  textFaint: "#A8A296",
  ink: palette.black,
  inkText: palette.bone,
  good: palette.good,
  goodBg: palette.goodBg,
  warning: palette.warning,
  warningBg: palette.warningBg,
  critical: palette.critical,
  criticalBg: palette.criticalBg,
  gold: palette.gold,
  goldSoft: palette.goldSoft,
  goldText: "#8A6D2F",
  goldBg: "#F0E6D0",
  heroGradient: [palette.black, "#2A2A27"],
  auroraGold: "rgba(200,171,114,.28)",
  auroraLinen: "rgba(216,204,184,.22)",
  shadowColor: "rgba(29,29,28,0.14)",
  onInk,
};

const dark: Theme = {
  mode: "dark",
  background: palette.black,
  surface: palette.inkSoft,
  surfaceAlt: palette.inkBorder,
  sheet: "#232320",
  border: "#46443C",
  separator: palette.inkBorder,
  text: palette.bone,
  textSecondary: onInk.secondary,
  textMuted: onInk.muted,
  textFaint: "#6E6A5E",
  ink: palette.bone,
  inkText: palette.black,
  good: "#9DB35A",
  goodBg: "#333D1A",
  warning: "#D9A45C",
  warningBg: "rgba(217,164,92,.16)",
  critical: "#E08267",
  criticalBg: "rgba(224,130,103,.14)",
  gold: palette.gold,
  goldSoft: palette.goldSoft,
  goldText: palette.goldSoft,
  goldBg: "rgba(200,171,114,.16)",
  heroGradient: ["#0F0F0E", "#242420"],
  auroraGold: "rgba(200,171,114,.22)",
  auroraLinen: "rgba(216,204,184,.14)",
  shadowColor: "rgba(0,0,0,0.5)",
  onInk,
};

export const radii = { card: 18, control: 12, pill: 999, hero: 20, sheet: 26, chip: 12 };

/** Retícula del handoff: 20 de padding lateral, 11-14 entre tarjetas. */
export const layout = { screenPadding: 20, gap: 12, cardPadding: 16, tabBarHeight: 76, touchMin: 44 };

/** Sombra de tarjeta (base) y elevada (hojas, spotlight). */
export function shadow(theme: Theme, elevated = false) {
  return {
    shadowColor: theme.shadowColor,
    shadowOpacity: elevated ? 1 : 0.6,
    shadowRadius: elevated ? 18 : 10,
    shadowOffset: { width: 0, height: elevated ? 10 : 4 },
    elevation: elevated ? 6 : 2,
  };
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  // Piel oscura por defecto: solo el ajuste explícito "claro" del sistema la cambia.
  return scheme === "light" ? light : dark;
}
