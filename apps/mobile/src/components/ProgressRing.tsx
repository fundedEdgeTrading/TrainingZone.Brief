import { useEffect, useState, type ReactNode } from "react";
import { Animated, View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";
import { countUp, easeOutSoft, useReducedMotion } from "@/theme/motion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Anillo de progreso: pista apagada + arco de color desde −90°, `strokeLinecap`
 * redondo. Sin `children` muestra el porcentaje; con `children` se pinta lo que
 * pida la pantalla (sesiones restantes, "% DEL DÍA"...).
 *
 * El arco se DIBUJA (700 ms, 120 ms después de que entre la tarjeta) en vez de
 * aparecer ya trazado: el anillo mide una proporción, y verlo recorrerse es lo
 * que hace leer cuánto abarca en lugar de mirar una forma. El retardo lo deja
 * empezar cuando la tarjeta ya está en su sitio.
 */
export function ProgressRing({
  progressPct,
  size = 78,
  strokeWidth = 5,
  color,
  trackColor,
  label,
  children,
  onInk = true,
}: {
  progressPct: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  children?: ReactNode;
  /** El anillo vive sobre tinta (héroe) salvo que la pantalla diga lo contrario. */
  onInk?: boolean;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, progressPct)) / 100);
  const textColor = onInk ? theme.onInk.text : theme.text;
  const labelColor = onInk ? theme.onInk.muted : theme.textMuted;

  // `strokeDashoffset` no lo puede llevar el hilo nativo (no es una propiedad
  // de layout ni de transform), así que este `Animated.Value` va en JS. Es UNA
  // por anillo y solo durante 700 ms.
  const [dash] = useState(() => new Animated.Value(circumference));
  useEffect(() => {
    if (reduced) {
      dash.setValue(offset);
      return;
    }
    const animation = Animated.timing(dash, {
      toValue: offset,
      duration: countUp.duration,
      delay: countUp.ringDelay,
      easing: easeOutSoft,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [dash, offset, reduced]);

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor ?? (onInk ? "rgba(244,240,232,.18)" : theme.surfaceAlt)}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color ?? theme.gold}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dash}
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.center}>
            {children ?? <Text style={[styles.percent, { color: textColor }]}>{Math.round(progressPct)}%</Text>}
          </View>
        </View>
      </View>
      {label ? <Text style={[styles.label, { color: labelColor }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 1 },
  percent: { fontFamily: fonts.bold, fontSize: 15, ...tabular },
  label: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.4 },
});
