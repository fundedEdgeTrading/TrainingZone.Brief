import { useEffect, useState } from "react";
import { Animated, View, type DimensionValue } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { useReducedMotion, duration } from "@/theme/motion";

/** Bloque de carga con latido suave (se queda plano si el sistema pide menos motion). */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = 8,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: duration.slower, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: duration.slower, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return <Animated.View style={{ width, height, borderRadius: radius, backgroundColor: theme.surfaceAlt, opacity: reduced ? 0.7 : pulse }} />;
}

/** Esqueleto de lista para la primera carga (`n` filas en tarjeta). */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={i}
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: radii.card,
            padding: 16,
            gap: 10,
          }}
        >
          <Skeleton width="55%" height={13} />
          <Skeleton width="80%" height={11} />
          <Skeleton width="35%" height={11} />
        </View>
      ))}
    </View>
  );
}
