import { Pressable, ScrollView, Text, StyleSheet } from "react-native";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";

const WEEKDAY = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

export function isoOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function nextDays(count: number, from = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    return isoOf(d);
  });
}

/** Tira de días: el seleccionado en hueso con texto tinta, el resto outline (≥ 44 px). */
export function DayStrip({
  days,
  value,
  onChange,
}: {
  days: string[];
  value: string;
  onChange: (iso: string) => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -layout.screenPadding }}
      contentContainerStyle={styles.row}
    >
      {days.map((iso) => {
        const date = new Date(`${iso}T00:00:00`);
        const selected = iso === value;
        return (
          <Pressable
            key={iso}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
            onPress={() => onChange(iso)}
            style={[
              styles.day,
              {
                backgroundColor: selected ? theme.ink : "transparent",
                borderColor: selected ? "transparent" : theme.border,
              },
            ]}
          >
            <Text style={[styles.weekday, { color: selected ? theme.inkText : theme.textMuted }]}>
              {WEEKDAY[date.getDay()]}
            </Text>
            <Text style={[styles.number, { color: selected ? theme.inkText : theme.text }]}>{date.getDate()}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, paddingHorizontal: layout.screenPadding },
  day: { width: 52, height: 60, borderRadius: radii.chip, borderWidth: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  weekday: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8 },
  number: { fontFamily: fonts.bold, fontSize: 16, ...tabular },
});
