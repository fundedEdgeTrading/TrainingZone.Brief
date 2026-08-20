import type { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";

/**
 * Anillo de progreso: pista apagada + arco de color desde −90°, `strokeLinecap`
 * redondo. Sin `children` muestra el porcentaje; con `children` se pinta lo que
 * pida la pantalla (sesiones restantes, "% DEL DÍA"...).
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
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, progressPct)) / 100);
  const textColor = onInk ? theme.onInk.text : theme.text;
  const labelColor = onInk ? theme.onInk.muted : theme.textMuted;

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
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color ?? theme.gold}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
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
