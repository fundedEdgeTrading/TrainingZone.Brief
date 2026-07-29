import { useColorScheme } from "react-native";

// Tokens de marca (docs/BRANDING.md) portados a React Native. Misma paleta
// que src/app/globals.css de la web, con equivalentes claro/oscuro.
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
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
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
  /** Fondo del héroe con degradado tinta→tinta suave (mismo tratamiento que .tz-card-sheen en web). */
  heroGradient: [string, string];
  /** Manchas "aurora" translúcidas sobre el héroe. */
  auroraGold: string;
  auroraLinen: string;
  shadowColor: string;
};

const light: Theme = {
  mode: "light",
  background: palette.bone,
  surface: palette.white,
  surfaceAlt: palette.sand,
  border: palette.linen,
  text: palette.black,
  textSecondary: palette.text2,
  textMuted: palette.muted,
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
  heroGradient: [palette.black, "#2A2A27"],
  auroraGold: "rgba(200,171,114,.28)",
  auroraLinen: "rgba(216,204,184,.22)",
  shadowColor: "rgba(29,29,28,0.14)",
};

const dark: Theme = {
  mode: "dark",
  background: palette.black,
  surface: palette.inkSoft,
  surfaceAlt: palette.inkBorder,
  border: "#46443C",
  text: palette.bone,
  textSecondary: "#C7C2B4",
  textMuted: "#9C9686",
  ink: palette.bone,
  inkText: palette.black,
  good: "#9DB35A",
  goodBg: "#333D1A",
  warning: "#D9A45C",
  warningBg: "#4A3A1A",
  critical: "#E08267",
  criticalBg: "#4A2A20",
  gold: palette.gold,
  goldSoft: palette.goldSoft,
  heroGradient: ["#0F0F0E", "#242420"],
  auroraGold: "rgba(200,171,114,.22)",
  auroraLinen: "rgba(216,204,184,.14)",
  shadowColor: "rgba(0,0,0,0.5)",
};

export const radii = { card: 18, control: 12, pill: 999 };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}
