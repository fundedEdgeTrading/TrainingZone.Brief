import { View, StyleSheet, type ViewProps } from "react-native";
import { useTheme, radii } from "@/theme/theme";

export function Card({ style, ...props }: ViewProps) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]} {...props} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 18, gap: 8 },
});
