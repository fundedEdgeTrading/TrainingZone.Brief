import { ActivityIndicator, Image, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useEvolution } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { formatShortDate } from "@/utils/format";

const STATUS_COLOR: Record<string, "good" | "warning" | "critical"> = { OK: "good", WATCH: "warning", ALERT: "critical" };

export default function EvolutionScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useEvolution();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <View>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>MI CUENTA</Text>
        <Text style={[styles.title, { color: theme.text }]}>Mi evolución</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar tu evolución" description="Desliza hacia abajo para reintentar." />
      ) : !data.consentHealth && !data.consentImages ? (
        <EmptyState
          title="Sin consentimiento firmado"
          description="En cuanto firmes el consentimiento de datos de salud o de imágenes en recepción, aquí verás tus fotos y tu composición corporal."
        />
      ) : (
        <>
          {data.compositionTiles.length > 0 ? (
            <Card>
              {data.measuredAt ? <Text style={[styles.measuredAt, { color: theme.textMuted }]}>Última toma · {data.measuredAt}</Text> : null}
              <View style={styles.tileGrid}>
                {data.compositionTiles
                  .filter((t) => t.value != null)
                  .map((t) => (
                    <View key={t.label} style={styles.tile}>
                      <Text style={[styles.tileLabel, { color: theme.textMuted }]}>{t.label}</Text>
                      <Text
                        style={[
                          styles.tileValue,
                          { color: t.status && STATUS_COLOR[t.status] ? theme[STATUS_COLOR[t.status]] : theme.text },
                        ]}
                      >
                        {t.value}
                      </Text>
                    </View>
                  ))}
              </View>
            </Card>
          ) : null}

          {data.progressEntries.length === 0 ? (
            <EmptyState title="Sin registros todavía" description="Tu entrenador añade una toma en cada seguimiento." />
          ) : (
            data.progressEntries.map((entry) => (
              <Card key={entry.id}>
                <Text style={[styles.entryDate, { color: theme.text }]}>{formatShortDate(entry.measuredAt ?? entry.date)}</Text>
                <View style={styles.pillRow}>
                  {entry.weightKg != null && <Pill label={`${entry.weightKg} kg`} />}
                  {entry.bodyFatPct != null && <Pill label={`${entry.bodyFatPct} % graso`} />}
                  {entry.muscleMassKg != null && <Pill label={`${entry.muscleMassKg} kg músculo`} />}
                  {entry.waistCm != null && <Pill label={`${entry.waistCm} cm cintura`} />}
                </View>
                {(entry.photoFrontUrl || entry.photoSideUrl || entry.photoBackUrl) && (
                  <View style={styles.photoRow}>
                    {[entry.photoFrontUrl, entry.photoSideUrl, entry.photoBackUrl]
                      .filter((url): url is string => Boolean(url))
                      .map((url) => (
                        <Image key={url} source={{ uri: url }} style={[styles.photo, { backgroundColor: theme.surfaceAlt }]} />
                      ))}
                  </View>
                )}
              </Card>
            ))
          )}
        </>
      )}
    </ScreenContainer>
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
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  measuredAt: { fontFamily: "Poppins_500Medium", fontSize: 11, marginBottom: 6 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  tile: { minWidth: "28%" },
  tileLabel: { fontFamily: "Poppins_500Medium", fontSize: 10, textTransform: "uppercase" },
  tileValue: { fontFamily: "Poppins_700Bold", fontSize: 16, marginTop: 2 },
  entryDate: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  photoRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  photo: { flex: 1, height: 100, borderRadius: 10 },
});
