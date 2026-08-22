import type { ReactNode } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { Icon } from "./Icon";

/** Separador interno de tarjeta (1 px apagado). */
export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.separator }} />;
}

/** Fila de lista estándar: bloque izquierdo, título + meta y accesorio derecho. */
export function ListRow({
  left,
  title,
  meta,
  right,
  onPress,
  chevron,
  dimmed,
  accessibilityLabel,
}: {
  left?: ReactNode;
  title: string;
  meta?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  dimmed?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const content = (
    <View style={[styles.row, dimmed ? { opacity: 0.6 } : null]}>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Icon name="chevron-right" size={16} color={theme.textFaint} /> : null}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 44, paddingVertical: 8 },
});
