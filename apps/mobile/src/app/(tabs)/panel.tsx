import { RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTrainerPanel } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { KpiTile } from "@/components/KpiTile";
import { HeroCard } from "@/components/HeroCard";
import { ProgressRing } from "@/components/ProgressRing";
import { Countdown } from "@/components/Countdown";
import { ListRow, Divider } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import type { TrainerAgendaSession, TrainerPanelResponse, TrainerPendingItem } from "@/api/types";

// C1 del handoff: panel del entrenador con spotlight de la sesión en curso,
// KPIs del mes, aviso de feedback pendiente y agenda del día.
export default function TrainerPanelScreen() {
  const { state } = useAuth();
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerPanel();
  const user = state.status === "signedIn" ? state.user : null;
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker={`MI PANEL${data?.centerName ? ` · ${data.centerName}` : ""}`}
          title={`Hola, ${firstName}`}
          tight
          right={<Avatar name={user?.name ?? ""} uri={user?.image} size={42} />}
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu panel" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <Spotlight data={data} />

          <FadeInUp delay={stagger(2)} style={styles.kpiRow}>
            <KpiTile label="Horas EP/mes" value={`${data.epHours} h`} tone="gold" small />
            <KpiTile label="Horas grupos" value={`${data.groupHours} h`} small />
            <KpiTile
              label="Clientes EP"
              value={`${data.epClients.length}`}
              small
              hint={data.epClientsNewThisMonth ? `+${data.epClientsNewThisMonth} este mes` : undefined}
              hintTone="good"
            />
            <KpiTile label="Adherencia" value={`${data.adherenceAvg}%`} tone="good" small />
          </FadeInUp>

          {data.pendingDebriefs.length > 0 ? (
            <FadeInUp delay={stagger(3)}>
              <Card style={{ borderColor: theme.warning, gap: 10 }}>
                <View style={styles.pendingHeader}>
                  <Badge label="Feedback pendiente" tone="warning" dot />
                  <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
                    {data.pendingDebriefs.length} {data.pendingDebriefs.length === 1 ? "sesión" : "sesiones"}
                  </Text>
                </View>
                {data.pendingDebriefs.slice(0, 3).map((item) => (
                  <PendingRow key={`${item.sessionId}-${item.occurrenceDate}`} item={item} />
                ))}
              </Card>
            </FadeInUp>
          ) : null}

          <SectionTitle label={data.agendaIsToday ? "Agenda de hoy" : `Agenda · ${data.agendaDay}`} />
          <FadeInUp delay={stagger(4)}>
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              {data.agendaSessions.length === 0 ? (
                <Text style={[typo.rowMeta, { color: theme.textMuted, padding: 16 }]}>Sin sesiones programadas.</Text>
              ) : (
                data.agendaSessions.map((session, index) => (
                  <View key={`${session.id}-${session.startTime}`}>
                    {index > 0 ? <Divider /> : null}
                    <AgendaRow session={session} agendaDay={data.agendaDay} />
                  </View>
                ))
              )}
            </Card>
          </FadeInUp>

          {data.aptitudeAlerts.length > 0 ? (
            <>
              <SectionTitle label="Alertas de aptitud" />
              <FadeInUp delay={stagger(5)}>
                <Card style={{ gap: 10 }}>
                  {data.aptitudeAlerts.map((alert) => (
                    <ListRow
                      key={alert.memberId}
                      left={<Avatar name={alert.name} size={34} />}
                      title={alert.name}
                      meta={`${alert.description} · ${alert.meta}`}
                      right={
                        <Badge
                          label={alert.light === "RED" ? "Evitar" : "Adaptar"}
                          tone={alert.light === "RED" ? "critical" : "warning"}
                        />
                      }
                    />
                  ))}
                </Card>
              </FadeInUp>
            </>
          ) : null}

          <SectionTitle label="Mis clientes de EP" />
          <FadeInUp delay={stagger(6)}>
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              {data.epClients.length === 0 ? (
                <Text style={[typo.rowMeta, { color: theme.textMuted, padding: 16 }]}>Sin clientes de EP asignados.</Text>
              ) : (
                data.epClients.map((client, index) => (
                  <View key={client.id} style={{ paddingHorizontal: 14 }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      left={<Avatar name={`${client.firstName} ${client.lastName}`} size={34} />}
                      title={`${client.firstName} ${client.lastName}`}
                      meta={`${client.planNames || "Sin bono"} · ${client.nextLabel}`}
                      right={<Text style={[styles.adherence, { color: theme.text }]}>{client.adherencePct}%</Text>}
                    />
                  </View>
                ))
              )}
            </Card>
          </FadeInUp>
        </>
      )}
    </ScreenContainer>
  );
}

function Spotlight({ data }: { data: TrainerPanelResponse }) {
  const theme = useTheme();
  const spotlight = data.currentSession ?? data.nextSession;
  if (!spotlight || !data.agendaIsToday) return null;

  const isCurrent = Boolean(data.currentSession);
  const seconds = (isCurrent ? spotlight.secondsRemaining : spotlight.secondsUntil) ?? 0;

  return (
    <FadeInUp delay={stagger(1)}>
      <HeroCard>
        <View style={styles.spotlightRow}>
          <ProgressRing progressPct={data.todayProgressPct} size={86} strokeWidth={6}>
            <Text style={[styles.ringValue, { color: theme.onInk.text }]}>{Math.round(data.todayProgressPct)}%</Text>
            <Text style={[typo.legend, { color: theme.onInk.muted }]}>DEL DÍA</Text>
          </ProgressRing>

          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={styles.spotlightBadgeRow}>
              <Badge label={isCurrent ? "En curso" : "Próxima"} tone="gold" />
              <Text style={[typo.rowMetaSmall, { color: theme.onInk.muted }]}>
                {isCurrent ? "quedan " : "empieza en "}
                <Countdown initialSeconds={seconds} format="mmss" style={[styles.countdown, { color: theme.onInk.text }]} />
              </Text>
            </View>
            <Text style={[styles.spotlightTitle, { color: theme.onInk.text }]} numberOfLines={1}>
              {spotlight.startTime}–{spotlight.endTime} · {spotlight.title}
            </Text>
            <Text style={[typo.rowMeta, { color: theme.onInk.secondary }]} numberOfLines={2}>
              {spotlight.meta}
            </Text>
            <Button
              title="Ver sesión"
              size="sm"
              style={{ alignSelf: "flex-start", marginTop: 6 }}
              onPress={() => router.push({ pathname: "/brief/[id]", params: { id: spotlight.id, d: data.agendaDay } })}
            />
          </View>
        </View>
      </HeroCard>
    </FadeInUp>
  );
}

function PendingRow({ item }: { item: TrainerPendingItem }) {
  return (
    <ListRow
      title={item.title}
      meta={item.detail}
      right={
        <Button
          title="Rellenar"
          variant="gold"
          size="sm"
          onPress={() => router.push({ pathname: "/feedback/[id]", params: { id: item.sessionId, d: item.occurrenceDate } })}
        />
      }
    />
  );
}

function AgendaRow({ session, agendaDay }: { session: TrainerAgendaSession; agendaDay: string }) {
  const theme = useTheme();
  const isNow = session.status === "current";

  return (
    <View
      style={[
        styles.agendaRow,
        isNow
          ? { backgroundColor: "rgba(200,171,114,.08)", borderColor: theme.gold, borderWidth: 1, borderRadius: radii.chip }
          : null,
        session.status === "past" ? { opacity: 0.6 } : null,
      ]}
    >
      <Text style={[styles.agendaTime, { color: theme.textSecondary }]}>{session.startTime}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitleSmall, { color: theme.text }]} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]} numberOfLines={1}>
          {session.meta}
        </Text>
      </View>
      <Badge label={session.chipLabel} tone={session.chipTone} />
      <Button
        title="Feedback"
        variant="ghost"
        size="sm"
        onPress={() => router.push({ pathname: "/feedback/[id]", params: { id: session.id, d: agendaDay } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  spotlightRow: { flexDirection: "row", gap: 16, alignItems: "center" },
  ringValue: { fontFamily: fonts.bold, fontSize: 17, ...tabular },
  spotlightBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  countdown: { fontFamily: fonts.bold, fontSize: 12, ...tabular },
  spotlightTitle: { fontFamily: fonts.bold, fontSize: 16.5 },
  pendingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  agendaRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  agendaTime: { fontFamily: fonts.bold, fontSize: 12.5, width: 44, ...tabular },
  adherence: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
});
