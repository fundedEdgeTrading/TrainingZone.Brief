import { useRef, useState } from "react";
import { PanResponder, Text, View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";

/** Color por tramo del feedback 1-10 (handoff C4): 1-3 crítico, 4-6 aviso, 7-10 bien. */
export function scoreTone(score: number, theme: { good: string; warning: string; critical: string }): string {
  if (score <= 3) return theme.critical;
  if (score <= 6) return theme.warning;
  return theme.good;
}

/**
 * Eje de 1 a 10: se puntúa tocando cualquiera de las 10 zonas de la barra o
 * arrastrando el dedo sobre ella. La fila mide 44 px y la barra 8 px de trazo
 * con 22 px de área táctil, como pide el handoff.
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
  // Refs mutables para el ancho medido y el último valor emitido: el
  // PanResponder las lee y escribe dentro de sus propios callbacks (grant/move),
  // que corren fuera del render, nunca durante él.
  const width = useRef(0);
  const last = useRef<number | null>(value);

  function scoreAt(x: number): number {
    if (width.current <= 0) return 1;
    const ratio = Math.max(0, Math.min(1, x / width.current));
    return Math.max(1, Math.min(10, Math.ceil(ratio * 10)));
  }

  // Responder creado una sola vez; sus callbacks (grant/move) leen los refs
  // de arriba fuera del render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const score = scoreAt(e.nativeEvent.locationX);
        last.current = score;
        onChange(score);
      },
      onPanResponderMove: (e) => {
        const score = scoreAt(e.nativeEvent.locationX);
        if (score !== last.current) {
          last.current = score;
          onChange(score);
        }
      },
    })
  );

  function onLayout(e: LayoutChangeEvent) {
    width.current = e.nativeEvent.layout.width;
  }

  const filled = value ?? 0;
  const color = value ? scoreTone(value, theme) : theme.surfaceAlt;

  return (
    <View style={styles.row} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}, ${value ?? "sin puntuar"} de 10`}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.value, { color: value ? color : theme.textFaint }]}>{value ?? "–"}</Text>
      </View>
      <View
        style={styles.touch}
        onLayout={onLayout}
        {...(disabled ? {} : responder.panHandlers)}
      >
        <View style={[styles.track, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
          <View style={{ width: `${filled * 10}%`, height: "100%", backgroundColor: color, borderRadius: radii.pill }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 44, justifyContent: "center", gap: 6, paddingVertical: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  label: { fontFamily: fonts.medium, fontSize: 12.5, flex: 1 },
  value: { fontFamily: fonts.bold, fontSize: 13.5, ...tabular },
  touch: { height: 22, justifyContent: "center" },
  track: { height: 8, borderRadius: radii.pill, borderWidth: 1, overflow: "hidden" },
});
