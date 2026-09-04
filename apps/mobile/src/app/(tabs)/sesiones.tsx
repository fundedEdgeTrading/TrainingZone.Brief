import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAgenda, useCancelBooking, useMemberCalendar } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Segmented } from "@/components/Segmented";
import { Countdown, formatCompact, useCountdown } from "@/components/Countdown";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import {
  currentMonth,
  formatLongDate,
  formatMonthTitle,
  monthGrid,
  shiftMonth,
  todayIso,
  WEEKDAY_INITIALS,
} from "@/utils/format";
import type { BookingStatus, CalendarEntry, UpcomingBooking } from "@/api/types";

type View_ = "proximas" | "calendario" | "historial";

/**
 * «Mis sesiones». Absorbe la pantalla de Calendario, que antes vivía suelta
 * detrás de Perfil.
 *
 * Eran dos pantallas contando lo mismo desde ángulos distintos: la lista
 * responde a «¿qué tengo ahora?» y la rejilla a «¿cómo ha ido el mes?». Como
 * pantallas separadas, la segunda no se encontraba —estaba dos niveles dentro
 * de una pestaña que se llamaba «Perfil»—; como vistas de un `Segmented`, se
 * cambia de una a otra con el pulgar y la reserva sigue siendo la misma.
 */
export default function MySessionsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const [view, setView] = useState<View_>("proximas");
  const { data, isLoading, isError, refetch, isRefetching } = useAgenda();
  const cancelBooking = useCancelBooking();

  const bookings = useMemo(() => (data?.upcomingBookings ?? []).filter((b) => !b.sessionCancelled), [data]);
  const [next, ...later] = bookings;
  const personalBalance = data?.balances.find((b) => b.serviceKind === "EP");

  function confirmCancel(booking: UpcomingBooking) {
    Alert.alert(
      "Cancelar la reserva",
      booking.canCancelFreely
        ? `¿Seguro que quieres cancelar ${booking.sessionName}? La sesión vuelve a tu bono.`
        : `Faltan menos de 12 h: cancelar ${booking.sessionName} consume la sesión del bono.`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar reserva",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelBooking.mutateAsync(booking.bookingId);
              toast.show("Reserva cancelada.");
            } catch (err) {
              toast.show(err instanceof Error ? err.message : "No se pudo cancelar.", "critical");
            }
          },
        },
      ]
    );
  }

  async function addToCalendar(booking: UpcomingBooking) {
    const start = new Date(booking.startsAt);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const stamp = (date: Date) => date.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: booking.sessionName,
      dates: `${stamp(start)}/${stamp(end)}`,
      details: `${booking.centerName}${booking.trainerName ? ` · ${booking.trainerName}` : ""}`,
      location: booking.room ? `${booking.centerName} · ${booking.room}` : booking.centerName,
    });
    await WebBrowser.openBrowserAsync(`https://calendar.google.com/calendar/render?${params.toString()}`);
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker="MIS SESIONES" title="Lo que tienes reservado" tight />
      </FadeInUp>

      <FadeInUp delay={stagger(1)}>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "proximas", label: "Próximas" },
            { value: "calendario", label: "Calendario" },
            { value: "historial", label: "Historial" },
          ]}
        />
      </FadeInUp>

      {view === "calendario" ? (
        <CalendarView mode="month" />
      ) : view === "historial" ? (
        <CalendarView mode="history" />
      ) : isLoading ? (
        <SkeletonList rows={3} shape="row" note="Cargando tus reservas…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar tus sesiones" description="Desliza hacia abajo para reintentar." />
      ) : !next ? (
        <EmptyState
          icon="calendar"
          title="Sin sesiones reservadas"
          description="Reserva desde la pestaña Reservar y aquí verás la cuenta atrás."
        />
      ) : (
        <>
          <FadeInUp delay={stagger(2)}>
            <NextSessionHero booking={next} onCancel={() => confirmCancel(next)} onAddToCalendar={() => addToCalendar(next)} />
          </FadeInUp>

          {later.length > 0 ? (
            <>
              <SectionTitle label="Más adelante" />
              {later.map((booking, index) => (
                <FadeInUp key={booking.bookingId} delay={stagger(index + 3)}>
                  <LaterRow booking={booking} highlight={index === 0} onPress={() => confirmCancel(booking)} />
                </FadeInUp>
              ))}
            </>
          ) : null}

          {personalBalance && !personalBalance.unlimited ? (
            <Card tone="dashed" style={styles.footerCard}>
              <Text style={[typo.rowMeta, { color: theme.textMuted, textAlign: "center" }]}>
                Te quedan{" "}
                <Text style={{ color: theme.goldText, fontFamily: fonts.bold }}>
                  {personalBalance.remaining ?? 0} sesiones personales
                </Text>{" "}
                en tu bono
              </Text>
            </Card>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

/**
 * Vista de calendario. `month` pinta la rejilla del mes con los tres estados
 * reales —Reservada (incluye lista de espera), Realizada y No presentada— y
 * `history` la misma información como lista, para quien busca una sesión
 * concreta y no un mes.
 */
function CalendarView({ mode }: { mode: "month" | "history" }) {
  const theme = useTheme();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<string>(todayIso());
  const { data, isLoading, isError } = useMemberCalendar(month);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of data?.entries ?? []) map.set(entry.day, [...(map.get(entry.day) ?? []), entry]);
    return map;
  }, [data]);

  function toneFor(status: BookingStatus): { color: string; label: string } | null {
    if (status === "ATTENDED") return { color: theme.good, label: "Realizada" };
    if (status === "NO_SHOW") return { color: theme.critical, label: "No presentada" };
    if (status === "BOOKED" || status === "WAITLISTED") return { color: theme.gold, label: "Reservada" };
    return null;
  }

  const weeks = monthGrid(month);
  const today = todayIso();
  const selectedEntries = byDay.get(selected) ?? [];

  return (
    <>
      <View style={styles.monthHeader}>
        <Text style={[typo.cardTitle, { color: theme.text, flex: 1 }]}>{formatMonthTitle(month)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          onPress={() => setMonth((m) => shiftMonth(m, -1))}
          style={[styles.navButton, { borderColor: theme.border }]}
        >
          <Icon name="chevron-left" size={16} color={theme.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          onPress={() => setMonth((m) => shiftMonth(m, 1))}
          style={[styles.navButton, { borderColor: theme.border }]}
        >
          <Icon name="chevron-right" size={16} color={theme.text} />
        </Pressable>
      </View>

      {isLoading ? (
        <SkeletonList rows={2} shape="card" note="Cargando tu calendario…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu calendario" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {mode === "month" ? (
            <>
              <View style={styles.legend}>
                {[
                  { color: theme.gold, label: "Reservada" },
                  { color: theme.good, label: "Realizada" },
                  { color: theme.critical, label: "No presentada" },
                ].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>{item.label}</Text>
                  </View>
                ))}
              </View>

              <Card padding={12}>
                <View style={styles.weekRow}>
                  {WEEKDAY_INITIALS.map((initial, index) => (
                    <Text
                      key={`${initial}-${index}`}
                      style={[typo.legend, { color: theme.textFaint, width: 42, textAlign: "center" }]}
                    >
                      {initial}
                    </Text>
                  ))}
                </View>

                {weeks.map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.weekRow}>
                    {week.map((day, dayIndex) => {
                      if (!day) return <View key={`empty-${dayIndex}`} style={styles.cell} />;
                      const entries = byDay.get(day) ?? [];
                      const tone = entries.length ? toneFor(entries[0].status) : null;
                      const isToday = day === today;
                      const isSelected = day === selected;
                      return (
                        <Pressable
                          key={day}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                          accessibilityLabel={`${formatLongDate(day)}${tone ? `, ${tone.label}` : ""}`}
                          onPress={() => setSelected(day)}
                          style={[
                            styles.cell,
                            isToday ? { backgroundColor: theme.ink, borderRadius: radii.chip } : null,
                            isSelected && !isToday ? { borderWidth: 1, borderColor: theme.gold, borderRadius: radii.chip } : null,
                          ]}
                        >
                          <Text style={[styles.cellNumber, { color: isToday ? theme.inkText : theme.text }]}>
                            {Number(day.slice(-2))}
                          </Text>
                          <View style={[styles.cellDot, { backgroundColor: tone?.color ?? "transparent" }]} />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </Card>

              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                Este mes: {data.summary.attended} realizadas · {data.summary.booked} reservadas
                {data.summary.noShow > 0 ? ` · ${data.summary.noShow} no presentadas` : ""}
              </Text>

              <Text style={[typo.cardTitleSmall, { color: theme.text }]}>{formatLongDate(selected)}</Text>
              {selectedEntries.length === 0 ? (
                <EmptyState icon="calendar" title="Sin sesiones ese día" />
              ) : (
                selectedEntries.map((entry) => <EntryCard key={entry.bookingId} entry={entry} tone={toneFor(entry.status)} />)
              )}
            </>
          ) : (data.entries ?? []).length === 0 ? (
            <EmptyState icon="clock" title="Sin sesiones este mes" description="Cambia de mes con las flechas de arriba." />
          ) : (
            [...data.entries]
              .sort((a, b) => b.day.localeCompare(a.day))
              .map((entry) => <EntryCard key={entry.bookingId} entry={entry} tone={toneFor(entry.status)} withDate />)
          )}
        </>
      )}
    </>
  );
}

function EntryCard({
  entry,
  tone,
  withDate,
}: {
  entry: CalendarEntry;
  tone: { color: string; label: string } | null;
  withDate?: boolean;
}) {
  const theme = useTheme();
  return (
    <Card padding={0} style={styles.entryCard}>
      <View style={[styles.entryBar, { backgroundColor: tone?.color ?? theme.surfaceAlt }]} />
      <View style={styles.entryBody}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
            {entry.sessionName}
          </Text>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {withDate ? `${formatLongDate(entry.day)} · ` : ""}
            {entry.startTime} – {entry.endTime} · {entry.trainerName ?? entry.centerName}
          </Text>
        </View>
        {tone ? (
          <Badge
            label={tone.label}
            tone={entry.status === "ATTENDED" ? "good" : entry.status === "NO_SHOW" ? "critical" : "gold"}
          />
        ) : null}
      </View>
    </Card>
  );
}

function NextSessionHero({
  booking,
  onCancel,
  onAddToCalendar,
}: {
  booking: UpcomingBooking;
  onCancel: () => void;
  onAddToCalendar: () => void;
}) {
  const theme = useTheme();
  const seconds = useCountdown({ targetIso: booking.startsAt });
  const live = seconds === 0;

  return (
    <HeroCard padding={17}>
      <View style={styles.heroKickerRow}>
        <View style={[styles.dot, { backgroundColor: live ? theme.good : theme.gold }]} />
        <Text style={[typo.kicker, { color: theme.onInk.muted }]}>{live ? "EN CURSO" : "EN"}</Text>
        {!live ? (
          <Countdown targetIso={booking.startsAt} format="compact" style={[styles.heroCompact, { color: theme.onInk.text }]} />
        ) : null}
      </View>

      <Text style={[typo.cardTitle, { color: theme.onInk.text, marginTop: 8 }]} numberOfLines={2}>
        {booking.sessionName}
      </Text>
      <Text style={[typo.rowMeta, { color: theme.onInk.secondary }]}>
        {booking.dayLabel} · {booking.startTime} – {booking.endTime}
        {booking.room ? ` · ${booking.room}` : ""}
      </Text>

      <View style={styles.heroTrainerRow}>
        <Avatar name={booking.trainerName ?? "Training Zone"} uri={booking.trainerImage} size={26} />
        <Text style={[typo.rowMeta, { color: theme.onInk.secondary }]}>{booking.trainerName ?? "Sin entrenador asignado"}</Text>
        {booking.status === "WAITLISTED" ? <Badge label="En espera" tone="gold" /> : null}
      </View>

      <View style={styles.heroActions}>
        <Button title="Añadir al calendario" size="sm" onPress={onAddToCalendar} style={{ flex: 1 }} />
        <Button title="Cancelar" variant="outline" size="sm" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </HeroCard>
  );
}

function LaterRow({ booking, highlight, onPress }: { booking: UpcomingBooking; highlight: boolean; onPress: () => void }) {
  const theme = useTheme();
  const date = new Date(booking.startsAt);
  const seconds = useCountdown({ targetIso: booking.startsAt });

  return (
    <Card padding={13} style={styles.laterCard}>
      <View style={[styles.dateBlock, { backgroundColor: theme.surfaceAlt }]}>
        <Text style={[styles.dateWeekday, { color: theme.textMuted }]}>
          {date.toLocaleDateString("es-ES", { weekday: "short" }).slice(0, 3).toUpperCase()}
        </Text>
        <Text style={[styles.dateNumber, { color: theme.text }]}>{date.getDate()}</Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {booking.sessionName}
        </Text>
        <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
          {booking.startTime} · {booking.trainerName ?? booking.centerName}
        </Text>
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Text style={[styles.remaining, { color: highlight ? theme.goldText : theme.textSecondary }]}>
          {formatCompact(seconds)}
        </Text>
        <Text style={[typo.legend, { color: theme.textFaint }]}>Restan</Text>
      </View>

      <Pressable accessibilityRole="button" accessibilityLabel="Cancelar reserva" hitSlop={8} onPress={onPress}>
        <Icon name="close" size={15} color={theme.textFaint} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  heroKickerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  heroCompact: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
  dot: { width: 7, height: 7, borderRadius: 4 },
  heroTrainerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  laterCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  dateBlock: { width: 44, height: 46, borderRadius: radii.chip, alignItems: "center", justifyContent: "center" },
  dateWeekday: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.8 },
  dateNumber: { fontFamily: fonts.bold, fontSize: 16, ...tabular },
  remaining: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
  footerCard: { alignItems: "center", paddingVertical: 14 },
  monthHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  navButton: { width: 34, height: 34, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  legend: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  cell: { width: 42, height: 42, alignItems: "center", justifyContent: "center", gap: 3 },
  cellNumber: { fontFamily: fonts.semibold, fontSize: 13, ...tabular },
  cellDot: { width: 5, height: 5, borderRadius: 3 },
  entryCard: { flexDirection: "row", overflow: "hidden" },
  entryBar: { width: 3 },
  entryBody: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, flex: 1 },
});
