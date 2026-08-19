import { useRef } from "react";
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
  onPressIn,
  onPressOut,
  ...props
}: Props) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  // primary = hueso sobre tinta (CTA de la maqueta); gold = acento de marca.
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.ink, fg: theme.inkText, border: "transparent" },
    gold: { bg: theme.gold, fg: "#1D1D1C", border: "transparent" },
    outline: { bg: "transparent", fg: theme.text, border: theme.border },
    ghost: { bg: theme.surfaceAlt, fg: theme.text, border: "transparent" },
    danger: { bg: "transparent", fg: theme.critical, border: theme.critical },
  };
  const { bg, fg, border } = palette[variant];

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
            <Text style={[size === "sm" ? typo.buttonSmall : typo.button, { color: fg }]} numberOfLines={1}>
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
  content: { flexDirection: "row", alignItems: "center", gap: 7 },
});
