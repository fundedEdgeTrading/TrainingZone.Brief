import type { PropsWithChildren } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, radii } from "@/theme/theme";

// Tarjeta "spotlight" en degradado tinta, con manchas doradas translúcidas —
// mismo tratamiento que el fondo `bg-brand-ink` + `tz-card-sheen` del panel
// del entrenador en web (src/app/(app)/trainer/page.tsx). El héroe se queda en
// tinta también en piel clara, como pide el handoff.
export function HeroCard({
  children,
  style,
  padding = 20,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padding?: number }>) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={theme.heroGradient}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, { padding }, style]}
    >
      <View pointerEvents="none" style={[styles.blob, styles.blobTop, { backgroundColor: theme.auroraGold }]} />
      <View pointerEvents="none" style={[styles.blob, styles.blobBottom, { backgroundColor: theme.auroraLinen }]} />
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.hero, overflow: "hidden" },
  blob: { position: "absolute", width: 220, height: 220, borderRadius: 110 },
  blobTop: { right: -70, top: -90 },
  blobBottom: { left: "20%", bottom: -110 },
  content: { position: "relative" },
});
