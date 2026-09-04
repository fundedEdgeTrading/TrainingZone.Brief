import { useState, type ReactNode } from "react";
import { Pressable, TextInput, View, Text, StyleSheet, type TextInputProps } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { fonts, typo } from "@/theme/typography";

type Props = TextInputProps & {
  label?: string;
  /** Acción en dorado a la derecha de la etiqueta (`VER` de la contraseña). */
  action?: { label: string; onPress: () => void };
  /** Sufijo fijo dentro del campo (`€/mes`). */
  suffix?: string;
  error?: string | null;
  right?: ReactNode;
  /**
   * El campo vive sobre tinta (el login, que entra siempre en oscuro sea cual
   * sea la piel del sistema). Sin esto, con el móvil en modo claro la etiqueta
   * salía en gris oscuro sobre casi negro —ilegible— y el campo se pintaba
   * blanco en medio de una pantalla de marca.
   */
  onInk?: boolean;
};

/** Colores fijos sobre tinta, iguales en las dos pieles (misma escala que el login). */
const INK = { label: "#C7C2B4", text: "#F4F0E8", placeholder: "#9C9686", surface: "#1A1A18", border: "#46443C" };

/**
 * Campo de formulario del handoff: alto 50, radio 12, y al enfocar borde
 * dorado con halo suave.
 */
export function Field({ label, action, suffix, error, right, style, multiline, onInk, onFocus, onBlur, ...props }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const idleBorder = onInk ? INK.border : theme.border;
  const borderColor = error ? theme.critical : focused ? theme.gold : idleBorder;
  const labelColor = onInk ? INK.label : theme.textSecondary;
  const textColor = onInk ? INK.text : theme.text;
  const surface = onInk ? INK.surface : theme.mode === "dark" ? "#232320" : theme.surface;
  const placeholder = onInk ? INK.placeholder : theme.textFaint;

  return (
    <View style={{ gap: 6 }}>
      {label || action ? (
        <View style={styles.labelRow}>
          {label ? <Text style={[typo.label, { color: labelColor, flex: 1 }]}>{label}</Text> : <View style={{ flex: 1 }} />}
          {action ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={action.onPress}>
              <Text style={[typo.label, { color: theme.goldText }]}>{action.label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View
        style={[
          styles.wrapper,
          {
            borderColor,
            backgroundColor: surface,
            minHeight: multiline ? 62 : 50,
            alignItems: multiline ? "flex-start" : "center",
          },
          focused ? { shadowColor: theme.gold, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } } : null,
        ]}
      >
        <TextInput
          placeholderTextColor={placeholder}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: textColor, textAlignVertical: multiline ? "top" : "center" }, style]}
          {...props}
        />
        {suffix ? <Text style={[styles.suffix, { color: theme.textMuted }]}>{suffix}</Text> : null}
        {right}
      </View>

      {error ? <Text style={[typo.rowMeta, { color: theme.critical }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  wrapper: { borderWidth: 1, borderRadius: radii.control, flexDirection: "row", paddingHorizontal: 14, gap: 8 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 14.5, paddingVertical: 12 },
  suffix: { fontFamily: fonts.semibold, fontSize: 12.5, alignSelf: "center" },
});
