import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useMemberCalendar } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { currentMonth, formatLongDate, formatMonthTitle, monthGrid, shiftMonth, todayIso, WEEKDAY_INITIALS } from "@/utils/format";
import type { BookingStatus, CalendarEntry } from "@/api/types";

// B5 del handoff: calendario del socio con realizadas, reservadas y no presentadas.
type Tone = { color: string; label: string };

export default function MemberCalendarScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<string>(todayIso());
  const { data, isLoading, isError, refetch, isRefetching } = useMemberCalendar(month);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of data?.entries ?? []) {
      map.set(entry.day, [...(map.get(entry.day) ?? []), entry]);
    }
    return map;
  }, [data]);

  function toneFor(status: BookingStatus): Tone | null {
    if (status === "ATTENDED") return { color: theme.good, label: "Realizada" };
    if (status === "NO_SHOW") return { color: theme.critical, label: "No presentada" };
    if (status === "BOOKED" || status === "WAITLISTED") return { color: theme.gold, label: "Reservada" };
    return null;
  }

  const weeks = monthGrid(month);
  const today = todayIso();
  const selectedEntries = byDay.get(selected) ?? [];

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <View style={styles.monthHeader}>
          <Text style={[typo.screenTitle, { color: theme.text, flex: 1 }]}>{formatMonthTitle(month)}</Text>
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
      </FadeInUp>

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

      {isLoading ? (
        <SkeletonList rows={2} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu calendario" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <Card padding={12}>
            <View style={styles.weekRow}>
              {WEEKDAY_INITIALS.map((initial, index) => (
                <Text key={`${initial}-${index}`} style={[typo.legend, { color: theme.textFaint, width: 42, textAlign: "center" }]}>
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
                      <Text
                        style={[
                          styles.cellNumber,
                          { color: isToday ? theme.inkText : theme.text },
                        ]}
                      >
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
            selectedEntries.map((entry) => {
              const tone = toneFor(entry.status);
              return (
                <Card key={entry.bookingId} padding={0} style={styles.entryCard}>
                  <View style={[styles.entryBar, { backgroundColor: tone?.color ?? theme.surfaceAlt }]} />
                  <View style={styles.entryBody}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {entry.sessionName}
                      </Text>
                      <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
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
            })
          )}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
