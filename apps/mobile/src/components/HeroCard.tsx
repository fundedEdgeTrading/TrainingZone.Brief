import type { PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, radii } from "@/theme/theme";

// Tarjeta "spotlight" en degradado tinta, con manchas doradas translúcidas —
// mismo tratamiento que el fondo `bg-brand-ink` + `tz-card-sheen` del panel
// del entrenador en web (src/app/(app)/trainer/page.tsx), sin blur nativo
// (no hay expo-blur en el proyecto) pero con la misma sensación de calidez.
export function HeroCard({ children, style }: PropsWithChildren<{ style?: object }>) {
  const theme = useTheme();
  return (
    <LinearGradient colors={theme.heroGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, style]}>
      <View pointerEvents="none" style={[styles.blob, styles.blobTop, { backgroundColor: theme.auroraGold }]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBottom, { backgroundColor: theme.auroraLinen }]} />
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card + 2, overflow: "hidden", padding: 20 },
  blob: { position: "absolute", width: 220, height: 220, borderRadius: 110 },
  blobTop: { right: -70, top: -90 },
  blobBottom: { left: "20%", bottom: -110 },
  content: { position: "relative" },
});
