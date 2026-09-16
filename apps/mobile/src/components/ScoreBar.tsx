import { Text, View, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";

/** Color por tramo de una puntuación de 1 a 10: 1-3 crítico, 4-6 aviso, 7-10 bien. */
function scoreTone(score: number, theme: { good: string; warning: string; critical: string }): string {
  if (score <= 3) return theme.critical;
  if (score <= 6) return theme.warning;
  return theme.good;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { fontFamily: fonts.medium, fontSize: 12.5, flex: 1 },
  value: { fontFamily: fonts.bold, fontSize: 15, ...tabular },
});

/**
 * Lectura sin edición de una puntuación (ficha del socio, resumen de sesión).
 *
 * Aquí ya no hay eje EDITABLE: los ocho ejes salieron del flujo de sala con
 * E3-07/E3-08 y su endpoint responde 410. Lo que queda es el histórico ya
 * escrito, que se sigue consultando desde la ficha del socio.
 */
export function ScoreReadout({ label, value }: { label: string; value: number | null }) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.label, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.value, { color: value ? scoreTone(value, theme) : theme.textFaint }]}>{value ?? "–"}</Text>
    </View>
  );
}
