import { Text, View, StyleSheet } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";

/** Serie corta (6 meses) del héroe de dirección: polilínea dorada + punto final. */
export function Sparkline({
  values,
  labels,
  width = 300,
  height = 54,
  color,
}: {
  values: number[];
  labels?: string[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const theme = useTheme();
  const stroke = color ?? theme.gold;
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 4 - ((v - min) / span) * (height - 10);
    return { x, y };
  });
  const last = points[points.length - 1];

  return (
    <View style={{ gap: 6 }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={last.x} cy={last.y} r={4} fill={stroke} />
      </Svg>
      {labels ? (
        <View style={[styles.labels, { width }]}>
          {labels.map((label, i) => (
            <Text
              key={`${label}-${i}`}
              style={[typo.legend, { color: i === labels.length - 1 ? theme.gold : theme.onInk.muted }]}
            >
              {label}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: "row", justifyContent: "space-between" },
});
