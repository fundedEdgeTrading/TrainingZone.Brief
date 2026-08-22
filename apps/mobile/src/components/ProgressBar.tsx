import { View } from "react-native";
import { useTheme, radii } from "@/theme/theme";

/** Barra de progreso plana (asistencia media, ranking, imputación a centros). */
export function ProgressBar({
  pct,
  color,
  height = 5,
  track,
  width,
}: {
  pct: number;
  color?: string;
  height?: number;
  track?: string;
  width?: number;
}) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View
      style={{
        width: width ?? "100%",
        height,
        borderRadius: radii.pill,
        backgroundColor: track ?? theme.surfaceAlt,
        overflow: "hidden",
      }}
    >
      <View style={{ width: `${clamped}%`, height: "100%", borderRadius: radii.pill, backgroundColor: color ?? theme.gold }} />
    </View>
  );
}
