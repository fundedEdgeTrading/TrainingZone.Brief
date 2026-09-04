import { useMemo } from "react";
import { RefreshControl, Text, View, StyleSheet } from "react-native";
import { useActivity, useEvolution } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { SafePhoto } from "@/components/SafePhoto";
import { formatShortDate } from "@/utils/format";
import type { ProgressEntry } from "@/api/types";

/**
 * «Evolución». Sube de estar escondida dentro de Perfil a ser pestaña propia, y
 * pasa a enseñar el DELTA respecto a la toma anterior, no solo el valor.
 *
 * El valor suelto («62,4 kg») no dice nada sin memoria; el delta («−1,2 desde
 * la toma anterior») es la única lectura que un socio puede hacer solo. Por eso
 * cada tile lleva su variación y su color: verde o rojo según si el cambio va
 * en la dirección que se busca para esa medida —bajar peso y cintura es
 * progreso; bajar masa muscular, no.
 */

/** Medidas en las que BAJAR es lo que se busca. */
const LOWER_IS_BETTER: Record<string, boolean> = { weightKg: true, bodyFatPct: true, waistCm: true, muscleMassKg: false };

const METRICS: { key: keyof ProgressEntry; label: string; unit: string; decimals: number }[] = [
  { key: "weightKg", label: "Peso", unit: "kg", decimals: 1 },
  { key: "bodyFatPct", label: "% graso", unit: "%", decimals: 1 },
  { key: "muscleMassKg", label: "Músculo", unit: "kg", decimals: 1 },
  { key: "waistCm", label: "Cintura", unit: "cm", decimals: 0 },
];

export default function EvolutionScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useEvolution();
  const activity = useActivity();

  // Las tomas llegan de la más reciente a la más antigua.
  const entries = useMemo(() => data?.progressEntries ?? [], [data]);
  const latest = entries[0];
  const previous = entries[1];

  const trend = useMemo(
    () =>
      [...entries]
        .reverse()
        .map((entry) => entry.weightKg)
        .filter((value): value is number => typeof value === "number"),
    [entries]
  );

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker={data?.measuredAt ? `ÚLTIMA TOMA · ${data.measuredAt}` : "TU EVOLUCIÓN"}
          title="Cómo vas"
          tight
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} shape="card" note="Cargando tus tomas…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu evolución" description="Desliza hacia abajo para reintentar." />
      ) : !data.consentHealth && !data.consentImages ? (
        <EmptyState
          icon="alert"
          title="Sin consentimiento firmado"
          description="En cuanto firmes el consentimiento de datos de salud o de imágenes en recepción, aquí verás tus fotos y tu composición corporal."
        />
      ) : (
        <>
          {latest ? (
            <FadeInUp delay={stagger(1)}>
              <View style={styles.tileGrid}>
                {METRICS.map((metric) => {
                  const value = latest[metric.key] as number | null;
                  const before = previous ? (previous[metric.key] as number | null) : null;
                  if (value == null) return null;
                  const delta = before != null ? value - before : null;
                  const better = delta == null ? null : LOWER_IS_BETTER[metric.key as string] ? delta < 0 : delta > 0;
                  return (
                    <View key={metric.key as string} style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <Text style={[typo.kpiLabel, { color: theme.textMuted }]} numberOfLines={1}>
                        {metric.label}
                      </Text>
                      <Text style={[styles.tileValue, { color: theme.text }]}>
                        {value.toFixed(metric.decimals).replace(".", ",")} {metric.unit}
                      </Text>
                      {delta != null && Math.abs(delta) >= 0.05 ? (
                        <Text style={[styles.tileDelta, { color: better ? theme.good : theme.critical }]}>
                          {delta > 0 ? "+" : "−"}
                          {Math.abs(delta).toFixed(metric.decimals).replace(".", ",")}
                        </Text>
                      ) : (
                        <Text style={[styles.tileDelta, { color: theme.textFaint }]}>sin cambio</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </FadeInUp>
          ) : null}

          {trend.length > 1 ? (
            <FadeInUp delay={stagger(2)}>
              <Card style={{ gap: 12 }}>
                <Text style={[typo.cardTitleSmall, { color: theme.text }]}>Tendencia de peso</Text>
                <Sparkline values={trend} height={72} />
                <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>
                  {trend.length} tomas registradas, de la más antigua a la más reciente.
                </Text>
              </Card>
            </FadeInUp>
          ) : null}

          {activity.data && activity.data.monthlyActivity.length > 0 ? (
            <FadeInUp delay={stagger(3)}>
              <Card style={{ gap: 12 }}>
                <Text style={[typo.cardTitleSmall, { color: theme.text }]}>Tu constancia · últimos 6 meses</Text>
                <View style={styles.chartRow}>
                  {activity.data.monthlyActivity.map((month) => {
                    const max = Math.max(1, ...activity.data!.monthlyActivity.map((m) => m.count));
                    const height = month.count === 0 ? 4 : Math.max(8, Math.round((month.count / max) * 72));
                    return (
                      <View key={month.label} style={styles.monthBarWrap}>
                        <View style={styles.monthBarTrack}>
                          <View style={[styles.monthBar, { height, backgroundColor: theme.gold }]} />
                        </View>
                        <Text style={[typo.legend, { color: theme.textMuted }]}>{month.label}</Text>
                        <Text style={[styles.monthCount, { color: theme.text }]}>{month.count}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </FadeInUp>
          ) : null}

          <SectionTitle label="Tomas anteriores" />
          {entries.length === 0 ? (
            <EmptyState icon="chart" title="Sin registros todavía" description="Tu entrenador añade una toma en cada seguimiento." />
          ) : (
            entries.map((entry) => (
              <Card key={entry.id} style={{ gap: 10 }}>
                <Text style={[typo.rowTitle, { color: theme.text }]}>{formatShortDate(entry.measuredAt ?? entry.date)}</Text>
                <View style={styles.pillRow}>
                  {entry.weightKg != null ? <Pill label={`${entry.weightKg} kg`} /> : null}
                  {entry.bodyFatPct != null ? <Pill label={`${entry.bodyFatPct} % graso`} /> : null}
                  {entry.muscleMassKg != null ? <Pill label={`${entry.muscleMassKg} kg músculo`} /> : null}
                  {entry.waistCm != null ? <Pill label={`${entry.waistCm} cm cintura`} /> : null}
                </View>
                <PhotoRow entry={entry} consent={data.consentImages} />
              </Card>
            ))
          )}
        </>
      )}
    </ScreenContainer>
  );
}

/**
 * Fotos de la toma. Los huecos sin foto se pintan como marcador con borde
 * discontinuo en vez de desaparecer: así se ve que faltan la lateral o la de
 * espalda, que es lo que el socio necesita saber antes del siguiente
 * seguimiento.
 */
function PhotoRow({ entry, consent }: { entry: ProgressEntry; consent: boolean }) {
  const theme = useTheme();
  if (!consent) return null;

  const slots: { label: string; uri: string | null }[] = [
    { label: "Frontal", uri: entry.photoFrontUrl },
    { label: "Lateral", uri: entry.photoSideUrl },
    { label: "Espalda", uri: entry.photoBackUrl },
  ];
  if (slots.every((slot) => !slot.uri)) return null;

  return (
    <View style={styles.photoRow}>
      {slots.map((slot) =>
        slot.uri ? (
          <SafePhoto key={slot.label} uri={slot.uri} style={styles.photo} backgroundColor={theme.surfaceAlt} />
        ) : (
          <View key={slot.label} style={[styles.photo, styles.photoPlaceholder, { borderColor: theme.border }]}>
            <Text style={[typo.legend, { color: theme.textFaint }]}>{slot.label}</Text>
          </View>
        )
      )}
    </View>
  );
}

function Pill({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.surfaceAlt }]}>
      <Text style={[styles.pillText, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexBasis: "47%", flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 13, gap: 3 },
  tileValue: { fontFamily: fonts.bold, fontSize: 21, ...tabular },
  tileDelta: { fontFamily: fonts.semibold, fontSize: 11.5, ...tabular },
  chartRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  monthBarWrap: { alignItems: "center", gap: 4, flex: 1 },
  monthBarTrack: { height: 72, justifyContent: "flex-end" },
  monthBar: { width: 18, borderRadius: 6 },
  monthCount: { fontFamily: fonts.semibold, fontSize: 12, ...tabular },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { borderRadius: radii.pill, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontFamily: fonts.semibold, fontSize: 11 },
  photoRow: { flexDirection: "row", gap: 8 },
  photo: { flex: 1, height: 100, borderRadius: 10 },
  photoPlaceholder: { borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
});
