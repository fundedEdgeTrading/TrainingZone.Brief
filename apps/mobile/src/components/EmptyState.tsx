import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  title,
  description,
  icon,
}: {
  title: string;
  description?: string;
  icon?: IconName;
}) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      {icon ? <Icon name={icon} size={26} color={theme.textFaint} /> : null}
      <Text style={[typo.cardTitleSmall, { color: theme.text, textAlign: "center" }]}>{title}</Text>
      {description ? (
        <Text style={[typo.body, { color: theme.textMuted, textAlign: "center", maxWidth: 280 }]}>{description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 36, alignItems: "center", gap: 8 },
});
