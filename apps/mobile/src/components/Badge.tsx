import { View, Text, StyleSheet } from "react-native";
import { useTheme, radii } from "@/theme/theme";

type Tone = "good" | "warning" | "critical" | "neutral";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const tones: Record<Tone, { bg: string; fg: string }> = {
    good: { bg: theme.goodBg, fg: theme.good },
    warning: { bg: theme.warningBg, fg: theme.warning },
    critical: { bg: theme.criticalBg, fg: theme.critical },
    neutral: { bg: theme.surfaceAlt, fg: theme.textSecondary },
  };
  const { bg, fg } = tones[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: 10, alignSelf: "flex-start" },
  text: { fontFamily: "Poppins_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
});
