import type { ReactNode } from "react";
import { ScrollView, Pressable, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts } from "@/theme/typography";
import { Avatar } from "./Avatar";

export type ChipTone = "gold" | "bone" | "neutral" | "critical";

/** Píldora de filtro. Seleccionada: dorada o hueso según el peso de la acción. */
export function Chip({
  label,
  selected,
  onPress,
  tone = "gold",
  photoUri,
  photoName,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: ChipTone;
  photoUri?: string | null;
  photoName?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const selectedBg = tone === "bone" ? theme.ink : tone === "gold" ? theme.gold : theme.surfaceAlt;
  const selectedFg = tone === "bone" ? theme.inkText : tone === "gold" ? "#1D1D1C" : theme.text;
  const idleFg = tone === "critical" ? theme.critical : theme.textSecondary;
  const idleBorder = tone === "critical" ? theme.critical : theme.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? selectedBg : "transparent",
          borderColor: selected ? "transparent" : idleBorder,
        },
        style,
      ]}
    >
      {photoName ? <Avatar name={photoName} uri={photoUri} size={22} /> : null}
      <Text style={[styles.label, { color: selected ? selectedFg : idleFg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Tira horizontal de chips con scroll y sin barra. */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={[{ marginHorizontal: -layout.screenPadding }, style]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  label: { fontFamily: fonts.semibold, fontSize: 12 },
  row: { flexDirection: "row", gap: 7, paddingHorizontal: layout.screenPadding, alignItems: "center" },
});
