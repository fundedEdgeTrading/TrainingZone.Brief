import { TextInput, View, Text, StyleSheet, type TextInputProps } from "react-native";
import { useTheme, radii } from "@/theme/theme";

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: radii.control, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Poppins_400Regular", fontSize: 15 },
});
