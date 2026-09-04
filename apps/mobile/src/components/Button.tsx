import { useState } from "react";
import {
  Animated,
  Pressable,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { useReducedMotion } from "@/theme/motion";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "gold" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = Omit<PressableProps, "style"> & {
  title: string;
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  /**
   * El botón va sobre tinta (héroe, login, cabecera en degradado).
   *
   * Esas superficies NO se aclaran con la piel del sistema —el héroe se queda
   * en tinta y el login entra siempre en oscuro—, pero la paleta del botón sí
   * la seguía, así que con el móvil en modo claro el `primary` pintaba tinta
   * sobre tinta (botón invisible: solo se leía su texto flotando) y el
   * `outline` ponía texto negro sobre casi negro. Con `onInk` los colores se
   * fijan a los de la piel oscura, que es la que hay debajo.
   */
  onInk?: boolean;
};

/** Colores fijos de la marca sobre tinta, iguales en las dos pieles. */
const INK_PALETTE: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: "#F4F0E8", fg: "#1D1D1C", border: "transparent" },
  gold: { bg: "#C8AB72", fg: "#1D1D1C", border: "transparent" },
  outline: { bg: "transparent", fg: "#F4F0E8", border: "rgba(244,240,232,.34)" },
  ghost: { bg: "rgba(244,240,232,.12)", fg: "#F4F0E8", border: "transparent" },
  danger: { bg: "transparent", fg: "#E08267", border: "#E08267" },
};

const HEIGHT: Record<Size, number> = { sm: 36, md: 46, lg: 54 };

export function Button({
  title,
  variant = "primary",
  size = "md",
  loading,
  icon,
  disabled,
  style,
  onInk,
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));

  // primary = hueso sobre tinta (CTA de la maqueta); gold = acento de marca.
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.ink, fg: theme.inkText, border: "transparent" },
    gold: { bg: theme.gold, fg: "#1D1D1C", border: "transparent" },
    outline: { bg: "transparent", fg: theme.text, border: theme.border },
    ghost: { bg: theme.surfaceAlt, fg: theme.text, border: "transparent" },
    danger: { bg: "transparent", fg: theme.critical, border: theme.critical },
  };
  const { bg, fg, border } = onInk ? INK_PALETTE[variant] : palette[variant];

  function animateTo(value: number) {
    if (reduced) return;
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  }

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
        disabled={disabled || loading}
        onPressIn={(e) => {
          animateTo(0.96);
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          animateTo(1);
          onPressOut?.(e);
        }}
        style={[
          styles.base,
          {
            height: HEIGHT[size],
            paddingHorizontal: size === "sm" ? 14 : 20,
            backgroundColor: bg,
            borderColor: border,
            borderWidth: border === "transparent" ? 0 : 1,
            opacity: disabled ? 0.45 : 1,
          },
        ]}
        {...props}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.content}>
            {icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} color={fg} /> : null}
            {/* `flexShrink` es lo que mantiene el rótulo DENTRO del botón: sin
                él, un título largo en un botón estrecho («Añadir al
                calendario» o «Agendar prueba» a media anchura) se salía por
                los lados en vez de recortarse. */}
            <Text
              style={[size === "sm" ? typo.buttonSmall : typo.button, styles.label, { color: fg }]}
              numberOfLines={1}
            >
              {title}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.control, alignItems: "center", justifyContent: "center" },
  content: { flexDirection: "row", alignItems: "center", gap: 7, maxWidth: "100%" },
  label: { flexShrink: 1 },
});
