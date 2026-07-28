import { ActivityIndicator, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useDashboard } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";

const STATE_LABEL: Record<string, string> = { ACTIVE: "Activos", DELINQUENT: "Morosos", FROZEN: "Congelados", CANCELLED: "Baja" };

function formatEuros(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
}

export default function DashboardScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <FadeInUp>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>VISTA GENERAL</Text>
        <Text style={[styles.title, { color: theme.text }]}>Panel de control</Text>
      </FadeInUp>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar el panel" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <FadeInUp delay={60} style={styles.kpiRow}>
            <Kpi label="Socios activos" value={`${data.kpis.activeMembers}`} />
            <Kpi label="Morosos" value={`${data.kpis.delinquent}`} tone={data.kpis.delinquent > 0 ? "critical" : undefined} />
            <Kpi label="Congelados" value={`${data.kpis.frozen}`} />
            <Kpi label="Alertas abiertas" value={`${data.kpis.openAlerts}`} tone={data.kpis.openAlerts > 0 ? "warning" : undefined} />
            <Kpi label="Ingresos del mes" value={formatEuros(data.kpis.monthRevenueCents)} tone="gold" />
            <Kpi label="Sesiones del mes" value={`${data.kpis.sessionsThisMonth}`} />
          </FadeInUp>

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Estado de socios</Text>
            {data.memberStateBreakdown.map((s) => (
              <View key={s.state} style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{STATE_LABEL[s.state] ?? s.state}</Text>
                <Text style={[styles.rowValue, { color: theme.text }]}>{s.count}</Text>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Ocupación por centro (30 días)</Text>
            {data.occupancyByCenter.map((c) => (
              <View key={c.center} style={styles.row}>
                <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>{c.center}</Text>
                <Text style={[styles.rowValue, { color: theme.text }]}>{c.occupancyPct}%</Text>
              </View>
            ))}
          </Card>

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>No-show (30 días)</Text>
            <Text style={[styles.bigValue, { color: theme.text }]}>{data.noShowRatePct}%</Text>
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "warning" | "critical" | "gold" }) {
  const theme = useTheme();
  const color = tone === "critical" ? theme.critical : tone === "warning" ? theme.warning : tone === "gold" ? theme.gold : theme.text;
  return (
    <Card style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { minWidth: "45%", flex: 1, alignItems: "center", padding: 14 },
  kpiValue: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  kpiLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, marginTop: 2, textAlign: "center" },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, marginBottom: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  rowLabel: { fontFamily: "Poppins_500Medium", fontSize: 13 },
  rowValue: { fontFamily: "Poppins_700Bold", fontSize: 13 },
  bigValue: { fontFamily: "Poppins_700Bold", fontSize: 32 },
});
