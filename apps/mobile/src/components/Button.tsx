import { Pressable, Text, StyleSheet, ActivityIndicator, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { useTheme, radii } from "@/theme/theme";

type Variant = "primary" | "secondary" | "danger";

type Props = Omit<PressableProps, "style"> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, variant = "primary", loading, disabled, style, ...props }: Props) {
  const theme = useTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const backgroundColor = isDanger ? theme.critical : isPrimary ? theme.ink : "transparent";
  const color = isDanger ? "#FFFFFF" : isPrimary ? theme.inkText : theme.text;
  const isOutline = !isPrimary && !isDanger;

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor: isOutline ? theme.border : "transparent",
          borderWidth: isOutline ? 1 : 0,
          opacity: pressed ? 0.85 : disabled ? 0.5 : 1,
        },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.text, { color }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.control, paddingVertical: 14, paddingHorizontal: 20, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: "Poppins_700Bold", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
});
