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

/** Segmentos de la barra de avance semanal del héroe. */
const PROGRESS_SEGMENTS = 9;

/**
 * Cola de debrief: las sesiones ya terminadas a las que les falta el semáforo.
 *
 * La ventana real es la del servidor (`trainer-panel-queries.ts`): entran las
 * sesiones de los ÚLTIMOS SIETE DÍAS con asistentes y sin debrief. Esta
 * pantalla anunciaba en rojo que «el feedback se cierra 48 h después de la
 * sesión» y pintaba una cuenta atrás — un plazo que no existe en ninguna parte
 * del servidor, calculado además parseando el «hace 3h 20m» del texto: todo lo
 * de más de dos días salía como «cierra en 0 h», o sea, perdido, cuando seguía
 * estando perfectamente a mano. El corte ahora es el que importa de verdad: lo
 * de hace más de un día primero, porque es lo que ya cuesta recordar.
 */
export default function FeedbackQueueScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerPanel();

  const groups = useMemo(() => {
    if (!data) return [];
    const older: TrainerPendingItem[] = [];
    const today: TrainerPendingItem[] = [];
    // `label` lo compone el servidor como «Hoy · 19:00» / «Ayer · 19:00» /
    // «martes · 19:00»: el día sale de ahí, no de una cuenta hecha aquí sobre
    // un texto pensado para leerse.
    for (const item of data.pendingDebriefs) {
      (item.label.startsWith("Hoy") ? today : older).push(item);
    }
    return [
      { key: "older", label: "De días anteriores", urgent: true, items: older },
      { key: "today", label: "De hoy", urgent: false, items: today },
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
        <ScreenHeader kicker="DEBRIEF DE SESIÓN" title="Cómo ha ido con cada uno" tight />
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
              {pending === 0 ? "Todo al día" : `${pending} ${pending === 1 ? "sesión" : "sesiones"} sin semáforo`}
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
                {totalToday === 0 ? "Sin sesiones terminadas hoy" : `${doneToday} de ${totalToday} de hoy con semáforo`}
              </Text>
              {pending > 0 ? (
                <Button
                  onInk
                  title="Seguir"
                  variant="gold"
                  size="sm"
                  onPress={() =>
                    router.push({
                      pathname: "/brief/[id]",
                      params: { id: data.pendingDebriefs[0].sessionId, d: data.pendingDebriefs[0].occurrenceDate },
                    })
                  }
                />
              ) : null}
            </View>
          </HeroCard>

          {pending > 0 ? (
            <View style={[styles.notice, { backgroundColor: theme.goldBg, borderColor: theme.gold }]}>
              <Icon name="alert" size={15} color={theme.goldText} />
              <Text style={[typo.rowMetaSmall, { color: theme.textSecondary, flex: 1, lineHeight: 16 }]}>
                Aquí entran las sesiones de los últimos siete días con asistentes y sin semáforo. Cuanto más tarde lo
                pongas, menos te acordarás de cómo fue.
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
                No tienes ningún debrief pendiente. Al terminar una sesión aparecerá aquí.
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

function PendingRow({ item }: { item: TrainerPendingItem }) {
  const theme = useTheme();
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
        {/* `relative` («hace 3h 20m») lo compone el servidor: es cuánto hace
            que terminó, no un plazo inventado en el cliente. */}
        <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
          {item.detail} · {item.relative}
        </Text>
      </View>
      <Button
        title="Pasar lista"
        variant="gold"
        size="sm"
        onPress={() => router.push({ pathname: "/brief/[id]", params: { id: item.sessionId, d: item.occurrenceDate } })}
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
