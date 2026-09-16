import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";
import { Icon } from "./Icon";

/**
 * Contador − valor + (aforo, sesiones incluidas). El `+` va en dorado.
 *
 * `step` porque no todo lo que se cuenta va de uno en uno: la duración de un
 * hueco de EP iba de 30 a 120 MINUTOS a pasos de 1, así que pasar de 60 a 90
 * eran treinta toques y nadie lo hacía — se publicaba el hueco con la duración
 * que viniera puesta.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 6, flex: 1 }}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restar"
          hitSlop={8}
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - step))}
          style={styles.control}
        >
          <Icon name="minus" size={16} color={value <= min ? theme.textFaint : theme.text} />
        </Pressable>
        <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sumar"
          hitSlop={8}
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + step))}
          style={styles.control}
        >
          <Icon name="plus" size={16} color={value >= max ? theme.textFaint : theme.gold} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.95, textTransform: "uppercase" },
  row: { height: 50, borderWidth: 1, borderRadius: radii.control, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 6 },
  control: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  value: { fontFamily: fonts.bold, fontSize: 16, ...tabular },
});
