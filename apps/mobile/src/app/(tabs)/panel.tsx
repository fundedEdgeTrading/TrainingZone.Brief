import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useNotifications, useTrainerPanel } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { HeroCard } from "@/components/HeroCard";
import { ProgressRing } from "@/components/ProgressRing";
import { Countdown } from "@/components/Countdown";
import { ListRow, Divider } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonScreen } from "@/components/Skeleton";
import { pluralize } from "@/utils/format";
import type { TrainerAgendaSession, TrainerPanelResponse } from "@/api/types";

/**
 * «Hoy» del entrenador. La pantalla responde a dos preguntas y solo a esas:
 * ¿qué hago con la sesión que tengo delante? y ¿qué me queda del día?
 *
 * De ahí el orden. El spotlight de la sesión viva trae sus DOS acciones reales
 * —pasar lista y abrir el brief—, no un genérico «ver sesión»: la diferencia
 * entre las dos es lo que hace el entrenador en ese minuto. El aviso de
 * feedback pendiente va inmediatamente después, con el plazo de cierre visible,
 * porque el feedback caduca a las 48 h y una vez cerrado ya no hay pantalla que
 * lo arregle.
 *
 * Los clientes de EP bajaron a la pestaña «Socios»: aquí ocupaban media
 * pantalla con una lista que se consulta antes de una sesión, no al abrir la app.
 */
export default function TrainerTodayScreen() {
  const { state } = useAuth();
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerPanel();
  const notifications = useNotifications();
  const user = state.status === "signedIn" ? state.user : null;
  const firstName = user?.name.split(" ")[0] ?? "";
  const unread = (notifications.data?.notifications ?? []).filter((n) => !n.resolvedAt && n.kind !== "TASK").length;

  return (
    <ScreenContainer
      enter="auth"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}
    >
      <FadeInUp>
        <ScreenHeader
          kicker={`HOY${data?.centerName ? ` · ${data.centerName}` : ""}`}
          title={`Hola, ${firstName}`}
          tight
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={unread ? `Avisos, ${unread} sin leer` : "Avisos"}
                onPress={() => router.push("/notificaciones")}
                style={[styles.iconButton, { borderColor: theme.border }]}
              >
                <Icon name="bell" size={17} color={theme.text} />
                {unread > 0 ? <View style={[styles.unreadDot, { backgroundColor: theme.critical }]} /> : null}
              </Pressable>
              <Avatar name={user?.name ?? ""} uri={user?.image} size={40} />
            </View>
          }
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonScreen note="Cargando tu día…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu día" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <Spotlight data={data} />

          {data.pendingDebriefs.length > 0 ? (
            <FadeInUp delay={stagger(2)}>
              <Card style={{ borderColor: theme.warning, gap: 10 }}>
                <View style={styles.pendingHeader}>
                  <View style={styles.pendingTitleRow}>
                    <View style={[styles.dot8, { backgroundColor: theme.warning }]} />
                    <Text style={[typo.cardTitleSmall, { color: theme.text }]}>
                      {data.pendingDebriefs.length} {data.pendingDebriefs.length === 1 ? "sesión" : "sesiones"} sin feedback
                    </Text>
                  </View>
                  <Button
                    title="Rellenar"
                    variant="gold"
                    size="sm"
                    onPress={() =>
                      router.push({
                        pathname: "/feedback/[id]",
                        params: { id: data.pendingDebriefs[0].sessionId, d: data.pendingDebriefs[0].occurrenceDate },
                      })
                    }
                  />
                </View>
                {/* El plazo, no solo el número: el feedback se cierra 48 h
                    después de la sesión y después ya no hay nada que rellenar. */}
                <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                  La más antigua: {data.pendingDebriefs[data.pendingDebriefs.length - 1].label.toLowerCase()} ·{" "}
                  {data.pendingDebriefs[data.pendingDebriefs.length - 1].relative}
                </Text>
              </Card>
            </FadeInUp>
          ) : null}

          <FadeInUp delay={stagger(3)}>
            <View style={styles.kpiGrid}>
              <KpiCell label="h EP/mes" value={data.epHours} tone={theme.goldText} />
              <KpiCell label="h grupos" value={data.groupHours} tone={theme.text} />
              <KpiCell
                label="clientes EP"
                value={`${data.epClients.length}`}
                tone={theme.text}
                hint={data.epClientsNewThisMonth ? `+${data.epClientsNewThisMonth}` : undefined}
                hintTone={theme.good}
              />
              <KpiCell label="adherencia" value={`${data.adherenceAvg}%`} tone={theme.good} />
            </View>
          </FadeInUp>

          <SectionTitle
            label={data.agendaIsToday ? "Resto del día" : `Agenda · ${data.agendaDay}`}
            right={
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push("/staff-agenda")}>
                <Text style={[typo.buttonSmall, { color: theme.goldText }]}>Ver agenda</Text>
              </Pressable>
            }
          />
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
              {/* Huecos de EP publicados que nadie ha reservado todavía: no son
                  «sin publicar» —lo están, es lo que cuenta la resta— sino sin
                  dueño, y por eso llevan a la agenda a llenarlos. Va apagado y
                  con `+` en dorado: es el único apunte del día que aún no
                  existe como sesión. */}
              {data.epSlotsPublished > data.epSlotsReserved ? (
                <>
                  <Divider />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ver los huecos de entrenamiento personal libres"
                    onPress={() => router.push("/staff-agenda")}
                    style={[styles.agendaRow, { opacity: 0.55 }]}
                  >
                    <Icon name="plus" size={16} color={theme.gold} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[typo.rowTitleSmall, { color: theme.text }]}>Huecos de EP sin reservar</Text>
                      <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
                        {pluralize(data.epSlotsPublished - data.epSlotsReserved, "libre", "libres")} esta semana
                      </Text>
                    </View>
                  </Pressable>
                </>
              ) : null}
            </Card>
          </FadeInUp>

          {data.aptitudeAlerts.length > 0 ? (
            <>
              <SectionTitle
                label="Requieren adaptación"
                right={
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push("/mis-socios")}>
                    <Text style={[typo.buttonSmall, { color: theme.goldText }]}>Ver socios</Text>
                  </Pressable>
                }
              />
              <FadeInUp delay={stagger(5)}>
                <Card style={{ gap: 10 }}>
                  {data.aptitudeAlerts.slice(0, 4).map((alert) => (
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
                      onPress={() => router.push(`/mis-socios/${alert.memberId}`)}
                    />
                  ))}
                </Card>
              </FadeInUp>
            </>
          ) : null}
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
    <HeroCard padding={17}>
      <View style={styles.spotlightRow}>
        <ProgressRing progressPct={data.todayProgressPct} size={86} strokeWidth={6}>
          <Text style={[styles.ringValue, { color: theme.onInk.text }]}>{Math.round(data.todayProgressPct)} %</Text>
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
        </View>
      </View>

      {/* Las dos acciones reales del minuto en que se abre esto, y son DOS
          pantallas distintas: pasar lista es el feedback socio a socio (que
          es donde se marca la asistencia) y el brief es el repaso previo de
          adaptaciones. Las dos abrían el brief, así que «Pasar lista» no
          llevaba a ninguna parte útil. */}
      <View style={styles.spotlightActions}>
        <Button
          onInk
          title="Pasar lista"
          variant="gold"
          size="sm"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/feedback/[id]", params: { id: spotlight.id, d: data.agendaDay } })}
        />
        <Button
          onInk
          title="Brief"
          variant="outline"
          size="sm"
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/brief/[id]", params: { id: spotlight.id, d: data.agendaDay } })}
        />
      </View>
    </HeroCard>
  );
}

/** Tile de KPI compacto: cuatro en una fila, como pide la retícula del día. */
function KpiCell({
  label,
  value,
  tone,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  tone: string;
  hint?: string;
  hintTone?: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.kpiTile, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.kpiValueRow}>
        <Text style={[typo.kpiSmall, { color: tone }]} numberOfLines={1}>
          {value}
        </Text>
        {hint ? <Text style={[styles.kpiHint, { color: hintTone ?? theme.good }]}>{hint}</Text> : null}
      </View>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function AgendaRow({ session, agendaDay }: { session: TrainerAgendaSession; agendaDay: string }) {
  const theme = useTheme();
  const isNow = session.status === "current";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${session.title} a las ${session.startTime}`}
      onPress={() => router.push({ pathname: "/brief/[id]", params: { id: session.id, d: agendaDay } })}
      style={[
        styles.agendaRow,
        isNow ? { borderColor: theme.gold, borderWidth: 1, borderRadius: radii.chip } : null,
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  unreadDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 4 },
  spotlightRow: { flexDirection: "row", gap: 16, alignItems: "center" },
  spotlightActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  ringValue: { fontFamily: fonts.bold, fontSize: 17, ...tabular },
  spotlightBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  countdown: { fontFamily: fonts.bold, fontSize: 12, ...tabular },
  spotlightTitle: { fontFamily: fonts.bold, fontSize: 16.5 },
  pendingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  pendingTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  dot8: { width: 8, height: 8, borderRadius: 4 },
  kpiGrid: { flexDirection: "row", gap: 8 },
  kpiTile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 9, gap: 3 },
  kpiValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  kpiHint: { fontFamily: fonts.bold, fontSize: 10.5, ...tabular },
  kpiLabel: { fontFamily: fonts.medium, fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase" },
  agendaRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  agendaTime: { fontFamily: fonts.bold, fontSize: 12.5, width: 44, ...tabular },
});
