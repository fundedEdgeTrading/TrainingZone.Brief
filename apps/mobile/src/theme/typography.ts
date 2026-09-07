import { StyleSheet } from "react-native";

// Escala tipográfica del handoff "App móvil premium". Poppins 400/500/600/700
// ya está cargada en app/_layout.tsx. Cualquier cifra (horas, precios,
// contadores, porcentajes) lleva `fontVariant: ["tabular-nums"]` para que no
// baile al actualizarse una cuenta atrás.
export const fonts = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
} as const;

export const tabular = { fontVariant: ["tabular-nums" as const] };

// E8-10: WCAG 1.4.4 exige que el texto escale hasta el 200 % sin recortarse.
// Por debajo de 11 px, el sistema operativo ya empieza a chocar con su propio
// suelo de legibilidad antes de llegar al 200 %, así que ningún estilo de
// texto de la app baja de ahí — los que aquí tenían 8.5-10.5 subieron a 11.
export const typo = StyleSheet.create({
  /** Kicker de pantalla: 700 · 11 · +1.5 · mayúsculas. */
  kicker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase" },
  /** Título de pantalla. */
  screenTitle: { fontFamily: fonts.bold, fontSize: 25 },
  screenTitleTight: { fontFamily: fonts.bold, fontSize: 23 },
  /** Cifra de héroe / cuenta atrás. */
  hero: { fontFamily: fonts.bold, fontSize: 44, letterSpacing: -0.9, ...tabular },
  heroSmall: { fontFamily: fonts.bold, fontSize: 34, letterSpacing: -0.6, ...tabular },
  kpi: { fontFamily: fonts.bold, fontSize: 25, ...tabular },
  kpiSmall: { fontFamily: fonts.bold, fontSize: 19, ...tabular },
  kpiLabel: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  cardTitle: { fontFamily: fonts.bold, fontSize: 17 },
  cardTitleSmall: { fontFamily: fonts.bold, fontSize: 15 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 14.5 },
  rowTitleSmall: { fontFamily: fonts.semibold, fontSize: 13.5 },
  rowMeta: { fontFamily: fonts.regular, fontSize: 11.5 },
  rowMetaSmall: { fontFamily: fonts.regular, fontSize: 11 },
  badge: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" },
  button: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },
  buttonSmall: { fontFamily: fonts.bold, fontSize: 11.5, letterSpacing: 0.9, textTransform: "uppercase" },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.95, textTransform: "uppercase" },
  body: { fontFamily: fonts.regular, fontSize: 13 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 12.5 },
  legend: { fontFamily: fonts.medium, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase" },
  /** Números en tabla/lista (horas, importes). */
  num: { fontFamily: fonts.bold, fontSize: 13.5, ...tabular },
});

/** Suelo de la app: ningún estilo de texto se declara por debajo de esto. */
export const MIN_FONT_SIZE = 11;
