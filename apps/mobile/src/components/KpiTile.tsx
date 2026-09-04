import type { ReactNode } from "react";
import { Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { splitNumeric, useCountUp } from "@/theme/use-count-up";
import { Card } from "./Card";

export type KpiTone = "default" | "gold" | "good" | "warning" | "critical";

/** Celda de KPI: cifra tabular grande + etiqueta en mayúsculas, con nota opcional. */
export function KpiTile({
  label,
  value,
  tone = "default",
  hint,
  hintTone,
  children,
  small,
  full,
}: {
  label: string;
  value: string;
  tone?: KpiTone;
  hint?: string;
  hintTone?: KpiTone;
  children?: ReactNode;
  small?: boolean;
  full?: boolean;
}) {
  const theme = useTheme();
  const color = (t: KpiTone) =>
    t === "gold" ? theme.gold : t === "good" ? theme.good : t === "warning" ? theme.warning : t === "critical" ? theme.critical : theme.text;

  // La cifra cuenta desde 0 hasta su valor. Solo si es una cifra: un «–» (sin
  // RPE registrado) o un «∞» no son números y se pintan tal cual, porque lo
  // que hay que leer ahí es que NO hay dato, no un cero que sí lo parecería.
  // El sufijo («%») se conserva aparte para no meterlo en el recuento.
  const numeric = splitNumeric(value);
  const counted = useCountUp(numeric?.value ?? 0, numeric?.decimals ?? 0);
  const shown = numeric ? `${counted}${numeric.suffix}` : value;

  return (
    <Card style={[styles.card, full ? { width: "100%" } : styles.half]} padding={14}>
      {/* Dos líneas para la etiqueta: en una fila de tres tiles («Sesiones del
          mes», «Asistencia media») el rótulo no cabía y se cortaba con puntos
          suspensivos, que en un KPI deja el número sin explicar. */}
      <Text style={[typo.kpiLabel, { color: theme.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[small ? typo.kpiSmall : typo.kpi, { color: color(tone) }]}>{shown}</Text>
      {hint ? (
        <Text style={[typo.rowMetaSmall, { color: color(hintTone ?? "default") }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 4 },
  /**
   * `flexShrink: 1` es obligatorio aquí: en React Native el valor por defecto
   * es 0 (no 1, como en la web), así que tres tiles del 47 % en una fila SIN
   * `flexWrap` —la ficha del socio y la del socio del entrenador— sumaban el
   * 141 % del ancho y el tercero se salía de la pantalla por la derecha. Con
   * `flexShrink` se reparten la fila, y donde la fila sí envuelve siguen
   * cayendo de dos en dos.
   */
  half: { flexBasis: "47%", flexGrow: 1, flexShrink: 1 },
});
