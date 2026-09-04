import type { ReactNode } from "react";
import { Text, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
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

  return (
    <Card style={[styles.card, full ? { width: "100%" } : { flexBasis: "47%", flexGrow: 1 }]} padding={14}>
      <Text style={[typo.kpiLabel, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[small ? typo.kpiSmall : typo.kpi, { color: color(tone) }]}>{value}</Text>
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
});
