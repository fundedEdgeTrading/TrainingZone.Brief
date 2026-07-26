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
};

export const radii = { card: 16, control: 10, pill: 999 };

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}
