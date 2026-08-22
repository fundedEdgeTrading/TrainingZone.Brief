import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { fonts } from "@/theme/typography";

/** Segmentado de dos o tres opciones (tipo de sesión, servicio del producto). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.surfaceAlt }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.item, selected ? { backgroundColor: theme.ink } : null]}
          >
            <Text style={[styles.label, { color: selected ? theme.inkText : theme.textSecondary }]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radii.control, padding: 3, gap: 3 },
  item: { flex: 1, height: 38, borderRadius: radii.control - 3, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.semibold, fontSize: 12.5 },
});
