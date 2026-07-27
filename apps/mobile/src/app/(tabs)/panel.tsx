import { ActivityIndicator, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTrainerPanel } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import type { TrainerAgendaSession, TrainerPendingItem } from "@/api/types";

export default function TrainerPanelScreen() {
  const { state } = useAuth();
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerPanel();
  const firstName = state.status === "signedIn" ? state.user.name.split(" ")[0] : "";

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <View>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>MI PANEL{data?.centerName ? ` · ${data.centerName}` : ""}</Text>
        <Text style={[styles.title, { color: theme.text }]}>Hola, {firstName}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar tu panel" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <View style={styles.kpiRow}>
            <Kpi label="Horas EP/mes" value={`${data.epHours}h`} />
            <Kpi label="Horas grupos" value={`${data.groupHours}h`} />
            <Kpi label="Clientes EP" value={`${data.epClients.length}`} />
            <Kpi label="Adherencia" value={`${data.adherenceAvg}%`} />
          </View>

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {data.agendaIsToday ? "Agenda de hoy" : `Agenda · ${data.agendaDay}`}
            </Text>
            {data.agendaSessions.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Sin sesiones programadas.</Text>
            ) : (
              data.agendaSessions.map((s) => <SessionRow key={s.id} session={s} />)
            )}
          </Card>

          {(data.pendingDebriefs.length > 0 || data.pendingBriefs.length > 0) && (
            <Card>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Pendientes</Text>
              {data.pendingDebriefs.map((p) => (
                <PendingRow key={`d-${p.sessionId}`} item={p} tone="warning" onPress={() => openBrief(p)} />
              ))}
              {data.pendingBriefs.map((p) => (
                <PendingRow key={`b-${p.sessionId}`} item={p} tone="warning" onPress={() => openBrief(p)} />
              ))}
            </Card>
          )}

          {data.aptitudeAlerts.length > 0 && (
            <Card>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Alertas de aptitud</Text>
              {data.aptitudeAlerts.map((a) => (
                <View key={a.memberId} style={styles.alertRow}>
                  <Badge label={a.light === "RED" ? "Evitar" : "Adaptar"} tone={a.light === "RED" ? "critical" : "warning"} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alertName, { color: theme.text }]}>{a.name}</Text>
                    <Text style={[styles.alertMeta, { color: theme.textMuted }]}>{a.description} · {a.meta}</Text>
                  </View>
                </View>
              ))}
            </Card>
          )}

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Mis clientes de EP</Text>
            {data.epClients.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Sin clientes de EP asignados.</Text>
            ) : (
              data.epClients.map((c) => (
                <View key={c.id} style={styles.clientRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.clientName, { color: theme.text }]}>
                      {c.firstName} {c.lastName}
                    </Text>
                    <Text style={[styles.clientMeta, { color: theme.textMuted }]}>{c.planNames || "—"} · {c.nextLabel}</Text>
                  </View>
                  <Text style={[styles.clientAdherence, { color: theme.text }]}>{c.adherencePct}%</Text>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}

function openBrief(item: TrainerPendingItem) {
  router.push({ pathname: "/brief/[id]", params: { id: item.sessionId, d: item.occurrenceDate } });
}

function Kpi({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>{label}</Text>
    </Card>
  );
}

function SessionRow({ session }: { session: TrainerAgendaSession }) {
  const theme = useTheme();
  return (
    <View style={styles.sessionRow}>
      <View style={{ width: 56 }}>
        <Text style={[styles.sessionTime, { color: theme.textSecondary }]}>{session.startTime}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sessionTitle, { color: theme.text }]}>{session.title}</Text>
        <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>{session.meta}</Text>
      </View>
      <Badge label={session.chipLabel} tone={session.chipTone === "gold" ? "warning" : session.chipTone} />
    </View>
  );
}

function PendingRow({ item, tone, onPress }: { item: TrainerPendingItem; tone: "warning" | "good"; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable style={styles.pendingRow} onPress={onPress}>
      <Badge label={item.label} tone={tone} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.pendingTitle, { color: theme.text }]}>{item.title}</Text>
        <Text style={[styles.pendingMeta, { color: theme.textMuted }]}>{item.detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCard: { minWidth: "45%", flex: 1, alignItems: "center", padding: 14 },
  kpiValue: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  kpiLabel: { fontFamily: "Poppins_500Medium", fontSize: 11, marginTop: 2, textAlign: "center" },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, marginBottom: 4 },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  sessionTime: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  sessionTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  sessionMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  alertName: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  alertMeta: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  clientRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  clientName: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  clientMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  clientAdherence: { fontFamily: "Poppins_700Bold", fontSize: 14 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  pendingTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  pendingMeta: { fontFamily: "Poppins_400Regular", fontSize: 12 },
});
