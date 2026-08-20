import type { ReactNode } from "react";
import { Text, View, StyleSheet } from "react-native";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";

/** Cabecera de pantalla: kicker + título, con acción o avatar a la derecha. */
export function ScreenHeader({
  kicker,
  title,
  right,
  tight,
}: {
  kicker?: string;
  title: string;
  right?: ReactNode;
  /** 23 px en vez de 25 cuando el título compite con un avatar o una fecha larga. */
  tight?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 3 }}>
        {kicker ? <Text style={[typo.kicker, { color: theme.textMuted }]}>{kicker}</Text> : null}
        <Text style={[tight ? typo.screenTitleTight : typo.screenTitle, { color: theme.text }]} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

/** Título de sección (`AGENDA DE HOY`, `ÚLTIMOS CONSUMOS`…) con acción opcional. */
export function SectionTitle({ label, right }: { label: string; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionRow}>
      <Text style={[typo.kicker, { color: theme.textMuted, flex: 1 }]}>{label}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
});
