import { RefreshControl, Text, View, StyleSheet, ActivityIndicator } from "react-native";
import { useAuth } from "@/auth/auth-context";
import { useActivity } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";

const LIGHT_COLOR: Record<string, "critical" | "warning" | "good"> = { RED: "critical", AMBER: "warning", GREEN: "good" };

export default function ActivityScreen() {
  const { state } = useAuth();
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useActivity();
  const firstName = state.status === "signedIn" ? state.user.name.split(" ")[0] : "";

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <View>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>MI ACTIVIDAD</Text>
        <Text style={[styles.title, { color: theme.text }]}>Hola, {firstName}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar tu actividad" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <View style={styles.kpiRow}>
            <Kpi label="Este mes" value={data.progress.totalThisMonth} />
            <Kpi label="Este año" value={data.progress.totalThisYear} />
            <Kpi label="Histórico" value={data.progress.totalAllTime} />
          </View>

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Últimos 6 meses</Text>
            <View style={styles.chartRow}>
              {data.monthlyActivity.map((m) => (
                <MonthBar key={m.label} label={m.label} count={m.count} />
              ))}
            </View>
          </Card>

          {data.plan && (
            <Card style={{ backgroundColor: theme.ink, borderColor: theme.ink }}>
              <Text style={[styles.planLabel, { color: theme.textMuted }]}>TU PLAN</Text>
              <Text style={[styles.planName, { color: theme.inkText }]}>{data.plan.planName}</Text>
            </Card>
          )}

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Lo que adapta tu entrenador</Text>
            {data.healthTransparency.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontFamily: "Poppins_400Regular", fontSize: 13 }}>
                No tienes ninguna condición de salud activa registrada ahora mismo.
              </Text>
            ) : (
              data.healthTransparency.map((a, i) => (
                <View key={i} style={styles.adaptationRow}>
                  <View style={[styles.dot, { backgroundColor: theme[LIGHT_COLOR[a.light]] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.adaptationTitle, { color: theme.text }]}>{a.blockArea}</Text>
                    {a.adaptation ? (
                      <Text style={[styles.adaptationText, { color: theme.textMuted }]}>{a.adaptation}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <Card style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{label}</Text>
    </Card>
  );
}

function MonthBar({ label, count }: { label: string; count: number }) {
  const theme = useTheme();
  const maxHeight = 72;
  const height = count === 0 ? 4 : Math.min(maxHeight, 10 + count * 8);
  return (
    <View style={styles.monthBarWrap}>
      <View style={styles.monthBarTrack}>
        <View style={[styles.monthBar, { height, backgroundColor: theme.ink }]} />
      </View>
      <Text style={[styles.monthLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.monthCount, { color: theme.text }]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  kpiRow: { flexDirection: "row", gap: 10 },
  kpiCard: { flex: 1, alignItems: "center", padding: 14 },
  kpiValue: { fontFamily: "Poppins_700Bold", fontSize: 24 },
  kpiLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, marginTop: 2, textAlign: "center" },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  chartRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8 },
  monthBarWrap: { alignItems: "center", gap: 4, flex: 1 },
  monthBarTrack: { height: 72, justifyContent: "flex-end" },
  monthBar: { width: 18, borderRadius: 6 },
  monthLabel: { fontFamily: "Poppins_500Medium", fontSize: 10, textTransform: "uppercase" },
  monthCount: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  planLabel: { fontFamily: "Poppins_700Bold", fontSize: 10, letterSpacing: 1 },
  planName: { fontFamily: "Poppins_700Bold", fontSize: 18, marginTop: 2 },
  adaptationRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  adaptationTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  adaptationText: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
});
