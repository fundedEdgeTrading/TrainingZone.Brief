import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";

export type BadgeTone = "good" | "warning" | "critical" | "neutral" | "gold" | "ink" | "outline";

export function Badge({
  label,
  tone = "neutral",
  dot,
  style,
}: {
  label: string;
  tone?: BadgeTone;
  /** Punto de color a la izquierda (avisos del handoff). */
  dot?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const tones: Record<BadgeTone, { bg: string; fg: string; border?: string }> = {
    good: { bg: theme.goodBg, fg: theme.good },
    warning: { bg: theme.warningBg, fg: theme.warning },
    critical: { bg: theme.criticalBg, fg: theme.critical },
    neutral: { bg: theme.surfaceAlt, fg: theme.textSecondary },
    gold: { bg: theme.goldBg, fg: theme.goldText },
    ink: { bg: theme.gold, fg: "#1D1D1C" },
    outline: { bg: "transparent", fg: theme.textSecondary, border: theme.border },
  };
  const { bg, fg, border } = tones[tone];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg, borderColor: border ?? "transparent", borderWidth: border ? 1 : 0 },
        style,
      ]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text style={[typo.badge, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.pill,
    paddingVertical: 4,
    paddingHorizontal: 9,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
