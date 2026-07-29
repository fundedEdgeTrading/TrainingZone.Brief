import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/theme/theme";

// Anillo de progreso (mismo tratamiento que el spotlight de src/app/(app)/trainer/page.tsx),
// con el porcentaje en el centro. `size` en dp, `strokeWidth` en dp.
export function ProgressRing({
  progressPct,
  size = 78,
  strokeWidth = 5,
  label,
}: {
  progressPct: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, progressPct)) / 100);

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(244,240,232,.18)" strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={theme.gold}
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
            <Text style={styles.percent}>{Math.round(progressPct)}%</Text>
          </View>
        </View>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  percent: { fontFamily: "Poppins_700Bold", fontSize: 15, color: "#F4F0E8" },
  label: { fontFamily: "Poppins_600SemiBold", fontSize: 10, color: "#A8A296", letterSpacing: 0.4 },
});
