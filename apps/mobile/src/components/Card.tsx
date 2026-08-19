import { View, StyleSheet, type ViewProps } from "react-native";
import { useTheme, radii, shadow } from "@/theme/theme";

type Props = ViewProps & {
  elevated?: boolean;
  /** `alt` = superficie de hoja/lista interna; `dashed` = marcador vacío; `accent` = borde dorado. */
  tone?: "default" | "alt" | "dashed" | "accent";
  padding?: number;
};

export function Card({ style, elevated, tone = "default", padding, ...props }: Props) {
  const theme = useTheme();
  const dashed = tone === "dashed";
  const accent = tone === "accent";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: dashed ? "transparent" : tone === "alt" ? theme.sheet : theme.surface,
          borderColor: accent ? theme.gold : dashed ? theme.border : theme.border,
          borderStyle: dashed ? "dashed" : "solid",
          padding: padding ?? 16,
        },
        dashed ? null : shadow(theme, elevated),
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, gap: 8 },
});
