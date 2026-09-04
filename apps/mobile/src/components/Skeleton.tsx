import { useEffect, useState } from "react";
import { Animated, Text, View, StyleSheet, type DimensionValue } from "react-native";
import { useTheme, radii, layout } from "@/theme/theme";
import { useReducedMotion } from "@/theme/motion";
import { typo } from "@/theme/typography";

/** Latido del esqueleto: 0.55 → 1 en 1.6 s (plano si el sistema pide menos motion). */
const PULSE_MS = 800;

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
        Animated.timing(pulse, { toValue: 1, duration: PULSE_MS, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: PULSE_MS, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  return (
    <Animated.View
      style={{ width, height, borderRadius: radius, backgroundColor: theme.surfaceAlt, opacity: reduced ? 0.7 : pulse }}
    />
  );
}

/**
 * Formas del esqueleto. El esqueleto CALCA la retícula real —mismas tarjetas,
 * mismas alturas, mismo `gap`— para que nada salte al llegar los datos: un
 * esqueleto genérico produce justo el salto que venía a evitar.
 */
export type SkeletonShape = "card" | "row" | "avatarRow" | "kpi" | "hero";

function SkeletonCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      {children}
    </View>
  );
}

/**
 * Cuatro celdas en una fila, la retícula real de `KpiCell` en el panel del
 * entrenador (`flex: 1`, gap 8, borde y superficie de tarjeta). Las celdas del
 * esqueleto no tenían ni fondo ni borde, así que en vez de cuatro tiles se
 * veían ocho barras grises sueltas y la tarjeta aparecía de golpe al llegar el
 * dato.
 */
function KpiSkeletonGrid() {
  const theme = useTheme();
  return (
    <View style={styles.kpiGrid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.kpiTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Skeleton width="60%" height={19} />
          <Skeleton width="85%" height={9} radius={6} />
        </View>
      ))}
    </View>
  );
}

function Shape({ shape }: { shape: SkeletonShape }) {
  if (shape === "hero") {
    return (
      <View style={[styles.card, styles.hero]}>
        <Skeleton width={96} height={10} radius={6} />
        <Skeleton width="70%" height={30} />
        <Skeleton width="52%" height={12} radius={6} />
        <View style={styles.heroActions}>
          <Skeleton width="48%" height={44} radius={12} />
          <Skeleton width="48%" height={44} radius={12} />
        </View>
      </View>
    );
  }

  if (shape === "kpi") {
    return <KpiSkeletonGrid />;
  }

  if (shape === "avatarRow") {
    return (
      <SkeletonCard>
        <View style={styles.avatarRow}>
          <Skeleton width={34} height={34} radius={999} />
          <View style={styles.avatarRowText}>
            <Skeleton width="55%" height={13} radius={6} />
            <Skeleton width="75%" height={10} radius={6} />
          </View>
          <Skeleton width={38} height={13} radius={6} />
        </View>
      </SkeletonCard>
    );
  }

  if (shape === "row") {
    return (
      <SkeletonCard>
        <View style={styles.avatarRow}>
          <Skeleton width={44} height={30} radius={8} />
          <View style={styles.avatarRowText}>
            <Skeleton width="60%" height={13} radius={6} />
            <Skeleton width="40%" height={10} radius={6} />
          </View>
        </View>
      </SkeletonCard>
    );
  }

  return (
    <SkeletonCard>
      <Skeleton width="55%" height={13} />
      <Skeleton width="80%" height={11} radius={6} />
      <Skeleton width="35%" height={11} radius={6} />
    </SkeletonCard>
  );
}

/**
 * Esqueleto de lista para la primera carga. `note` es la línea discreta de
 * debajo («Cargando tus socios…»): dice QUÉ se está cargando, que es lo que
 * un rectángulo gris no puede decir.
 */
export function SkeletonList({
  rows = 3,
  shape = "card",
  note,
}: {
  rows?: number;
  shape?: SkeletonShape;
  note?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: layout.gap }} accessibilityLabel={note ?? "Cargando"}>
      {Array.from({ length: rows }, (_, i) => (
        <Shape key={i} shape={shape} />
      ))}
      {note ? <Text style={[typo.rowMeta, { color: theme.textFaint, textAlign: "center" }]}>{note}</Text> : null}
    </View>
  );
}

/**
 * Esqueleto de una pantalla completa: héroe + KPIs + filas, en el orden de la
 * pantalla real. La cabecera, el buscador y los filtros los pinta cada pantalla
 * de verdad desde el primer fotograma; aquí solo van los datos.
 */
export function SkeletonScreen({ note }: { note?: string }) {
  return (
    <View style={{ gap: layout.gap }}>
      <Shape shape="hero" />
      <Shape shape="kpi" />
      <SkeletonList rows={3} shape="row" note={note} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 16, gap: 10 },
  hero: { borderColor: "transparent", backgroundColor: "transparent", padding: 17, gap: 12 },
  heroActions: { flexDirection: "row", gap: 10 },
  kpiGrid: { flexDirection: "row", gap: 8 },
  kpiTile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 9, gap: 7 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  avatarRowText: { flex: 1, gap: 7 },
});
