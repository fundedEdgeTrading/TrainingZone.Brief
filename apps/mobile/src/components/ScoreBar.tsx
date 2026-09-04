import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";

/** Color por tramo del feedback 1-10 (handoff C4): 1-3 crítico, 4-6 aviso, 7-10 bien. */
export function scoreTone(score: number, theme: { good: string; warning: string; critical: string }): string {
  if (score <= 3) return theme.critical;
  if (score <= 6) return theme.warning;
  return theme.good;
}

const SEGMENTS = Array.from({ length: 10 }, (_, i) => i + 1);

/**
 * Eje de 1 a 10, rediseñado: DIEZ SEGMENTOS TÁCTILES de 34 px de alto en vez de
 * una barra de 8 px con arrastre.
 *
 * El cambio no es estético. Con la barra fina, puntuar exigía apuntar a una
 * franja de 8 px y arrastrar; en una sala, de pie y con el móvil en una mano,
 * eso produce puntuaciones equivocadas que luego quedan en la ficha del socio.
 * Cada segmento es ahora un objetivo propio, muy por encima del mínimo táctil
 * de 44 px de área efectiva, y un toque es exactamente una puntuación.
 *
 * Los rellenos van en `theme.gold` hasta el valor —no en el color del tramo—
 * porque lo que se lee de un vistazo es CUÁNTO, y el juicio (verde/ámbar/rojo)
 * lo lleva la cifra de la derecha, que sí usa `scoreTone`.
 */
export function ScoreBar({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label}, ${value ?? "sin puntuar"} de 10`}
    >
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.value, { color: value ? theme.gold : theme.textFaint }]}>{value ?? "–"}</Text>
      </View>
      <View style={styles.segments}>
        {SEGMENTS.map((score) => {
          const filled = value != null && score <= value;
          return (
            <Pressable
              key={score}
              accessibilityRole="button"
              accessibilityLabel={`${score} de 10`}
              accessibilityState={{ selected: value === score }}
              disabled={disabled}
              onPress={() => onChange(score)}
              style={[
                styles.segment,
                {
                  backgroundColor: filled ? theme.gold : theme.surfaceAlt,
                  borderColor: value === score ? theme.goldSoft : "transparent",
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { fontFamily: fonts.medium, fontSize: 12.5, flex: 1 },
  value: { fontFamily: fonts.bold, fontSize: 15, ...tabular },
  segments: { flexDirection: "row", gap: 3 },
  segment: { flex: 1, height: 34, borderRadius: 7, borderWidth: 1.5 },
});

/** Lectura sin edición de una puntuación (ficha del socio, resumen de sesión). */
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
