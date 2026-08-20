import { Switch, Text, View, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";

/** Fila con interruptor: etiqueta, sublínea opcional y `Switch` con el dorado de marca. */
export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitle, { color: theme.text }]}>{label}</Text>
        {description ? <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.surfaceAlt, true: theme.gold }}
        thumbColor={theme.mode === "dark" ? "#F4F0E8" : "#FFFFFF"}
        ios_backgroundColor={theme.surfaceAlt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
});
