import { useMemo } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useTrainerPanel } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import type { TrainerAgendaSession, TrainerPendingItem } from "@/api/types";

/** El feedback se cierra 48 h después de la sesión (feedback-capture.ts). */
const CLOSE_WINDOW_HOURS = 48;
/** Segmentos de la barra de avance semanal del héroe. */
const PROGRESS_SEGMENTS = 9;

/**
 * Cola de feedback. Lo que ordena esta pantalla NO es el orden del día sino la
 * URGENCIA: el feedback caduca a las 48 h, y lo que está a punto de cerrarse es
 * lo único irrecuperable. Por eso el primer corte es «cierra en X h», en
 * `theme.critical`, y las sesiones de hoy que aún no han terminado van al final
 * con su acción deshabilitada: no se puede puntuar una sesión que no ha pasado.
 */
export default function FeedbackQueueScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerPanel();

  const groups = useMemo(() => {
    if (!data) return [];
    const closing: TrainerPendingItem[] = [];
    const rest: TrainerPendingItem[] = [];
    for (const item of data.pendingDebriefs) {
      (hoursLeft(item) <= 24 ? closing : rest).push(item);
    }
    // El plazo del rótulo es el del MÁS URGENTE del grupo, no el del primero:
    // `pendingDebriefs` viene de más reciente a más antiguo, así que `[0]` era
    // justo el que más margen tenía y el corte anunciaba más horas de las que
    // realmente quedaban.
    const soonest = closing.length ? Math.min(...closing.map(hoursLeft)) : 0;
    return [
      { key: "closing", label: closing.length ? `Cierra en ${Math.max(0, Math.round(soonest))} h` : "", urgent: true, items: closing },
      { key: "rest", label: "Esta semana", urgent: false, items: rest },
    ].filter((group) => group.items.length > 0);
  }, [data]);

  const pending = data?.pendingDebriefs.length ?? 0;
  const todaySessions = useMemo(() => data?.todaySessions ?? [], [data]);
  // Una sesión de hoy ya terminada solo cuenta como «hecha» si NO está en la
  // cola de pendientes. Sumando todas las pasadas, la misma sesión se contaba
  // a la vez como hecha y como pendiente y el marcador decía cosas como
  // «3 de 5 hechas» con las tres sin puntuar.
  const pendingTodayIds = useMemo(
    () => new Set((data?.pendingDebriefs ?? []).map((item) => `${item.sessionId}:${item.occurrenceDate}`)),
    [data]
  );
  const pendingToday = useMemo(
    () => todaySessions.filter((s) => s.status === "past" && pendingTodayIds.has(`${s.id}:${data?.agendaDay ?? ""}`)).length,
    [todaySessions, pendingTodayIds, data]
  );
  const doneToday = todaySessions.filter((s) => s.status === "past").length - pendingToday;
  const totalToday = todaySessions.filter((s) => s.status === "past").length;
  const filled = totalToday ? Math.round((doneToday / totalToday) * PROGRESS_SEGMENTS) : PROGRESS_SEGMENTS;

  const upcoming = todaySessions.filter((s) => s.status !== "past");

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker="FEEDBACK 1-10" title="Puntúa a tus socios" tight />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={4} shape="row" note="Cargando tu cola de feedback…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <HeroCard padding={17}>
            <Text style={[typo.kicker, { color: theme.onInk.muted }]}>ESTA SEMANA</Text>
            <Text style={[styles.heroTitle, { color: theme.onInk.text }]}>
              {pending === 0 ? "Todo al día" : `${pending} ${pending === 1 ? "sesión" : "sesiones"} por puntuar`}
            </Text>
            <View style={styles.segments}>
              {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
                <View key={i} style={[styles.segment, { backgroundColor: i < filled ? theme.gold : "#3A382F" }]} />
              ))}
            </View>
            <View style={styles.heroFooter}>
              {/* El marcador es de HOY, no de la semana: decirlo evita leer
                  «2 de 3» como si fuera el total de la cola de arriba. */}
              <Text style={[typo.rowMeta, { color: theme.onInk.secondary, flex: 1 }]}>
                {totalToday === 0 ? "Sin sesiones terminadas hoy" : `${doneToday} de ${totalToday} de hoy puntuadas`}
              </Text>
              {pending > 0 ? (
                <Button
                  onInk
                  title="Seguir"
                  variant="gold"
                  size="sm"
                  onPress={() =>
                    router.push({
                      pathname: "/feedback/[id]",
                      params: { id: data.pendingDebriefs[0].sessionId, d: data.pendingDebriefs[0].occurrenceDate },
                    })
                  }
                />
              ) : null}
            </View>
          </HeroCard>

          {pending > 0 ? (
            <View style={[styles.notice, { backgroundColor: theme.criticalBg, borderColor: theme.critical }]}>
              <Icon name="alert" size={15} color={theme.critical} />
              <Text style={[typo.rowMetaSmall, { color: theme.textSecondary, flex: 1, lineHeight: 16 }]}>
                El feedback se cierra {CLOSE_WINDOW_HOURS} h después de la sesión. Lo que se pasa de plazo no se puede
                rellenar después.
              </Text>
            </View>
          ) : null}

          {groups.map((group) => (
            <View key={group.key} style={{ gap: 10 }}>
              <Text style={[typo.kicker, { color: group.urgent ? theme.critical : theme.textMuted, marginTop: 4 }]}>
                {group.label}
              </Text>
              {group.items.map((item, index) => (
                <FadeInUp key={`${item.sessionId}-${item.occurrenceDate}`} delay={stagger(index)}>
                  <PendingRow item={item} />
                </FadeInUp>
              ))}
            </View>
          ))}

          {pending === 0 ? (
            <Card style={{ gap: 8 }}>
              <Badge label="Al día" tone="good" dot />
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                No tienes feedback pendiente. Al terminar una sesión aparecerá aquí.
              </Text>
            </Card>
          ) : null}

          {upcoming.length > 0 ? (
            <>
              <Text style={[typo.kicker, { color: theme.textMuted, marginTop: 4 }]}>Todavía por dar</Text>
              <Card tone="alt" padding={0} style={{ gap: 0 }}>
                {upcoming.map((session) => (
                  <UpcomingRow key={`${session.id}-${session.startTime}`} session={session} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

/**
 * Horas que quedan hasta el cierre. `relative` viene del servidor como «hace 3h
 * 20m»: la cuenta se hace sobre eso, que es lo que hay, en vez de inventar un
 * instante en el cliente.
 */
function hoursLeft(item: TrainerPendingItem): number {
  const match = /hace\s+(\d+)\s*h/.exec(item.relative);
  const elapsed = match ? Number(match[1]) : 0;
  return Math.max(0, CLOSE_WINDOW_HOURS - elapsed);
}

function PendingRow({ item }: { item: TrainerPendingItem }) {
  const theme = useTheme();
  const left = hoursLeft(item);
  const [time] = item.label.split(" · ").slice(-1);

  return (
    <Card style={styles.row}>
      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: theme.text }]}>{time}</Text>
        <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]} numberOfLines={1}>
          {item.label.split(" · ")[0]}
        </Text>
      </View>
      <View style={[styles.rule, { backgroundColor: theme.separator }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={[typo.rowMeta, { color: left <= 12 ? theme.critical : theme.textMuted }]} numberOfLines={1}>
          {item.detail} · cierra en {Math.round(left)} h
        </Text>
      </View>
      <Button
        title="Empezar"
        variant="gold"
        size="sm"
        onPress={() => router.push({ pathname: "/feedback/[id]", params: { id: item.sessionId, d: item.occurrenceDate } })}
      />
    </Card>
  );
}

function UpcomingRow({ session }: { session: TrainerAgendaSession }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" disabled style={[styles.row, { paddingHorizontal: 14, opacity: 0.55 }]}>
      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: theme.textSecondary }]}>{session.startTime}</Text>
        <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>{session.durationMin} min</Text>
      </View>
      <View style={[styles.rule, { backgroundColor: theme.separator }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitleSmall, { color: theme.text }]} numberOfLines={1}>
          {session.title}
        </Text>
        <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]} numberOfLines={1}>
          {session.status === "current" ? "en curso" : "aún no ha terminado"}
        </Text>
      </View>
      {/* Deshabilitado a propósito: puntuar una sesión que no ha pasado
          produciría feedback inventado. */}
      <Badge label="Más tarde" tone="outline" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heroTitle: { fontFamily: fonts.bold, fontSize: 20, marginTop: 6 },
  segments: { flexDirection: "row", gap: 4, marginTop: 14 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  heroFooter: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  notice: { flexDirection: "row", gap: 9, borderWidth: 1, borderRadius: radii.control, padding: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  timeColumn: { width: 44, gap: 2 },
  time: { fontFamily: fonts.bold, fontSize: 13.5, ...tabular },
  rule: { width: 1, alignSelf: "stretch" },
});
