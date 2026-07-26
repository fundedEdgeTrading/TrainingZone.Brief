import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? <Text style={[styles.description, { color: theme.textMuted }]}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 40, alignItems: "center", gap: 6 },
  title: { fontFamily: "Poppins_600SemiBold", fontSize: 15, textAlign: "center" },
  description: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", maxWidth: 280 },
});
