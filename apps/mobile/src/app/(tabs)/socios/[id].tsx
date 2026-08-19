import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMemberCalendarOf, useMemberDetail } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { ScreenContainer } from "@/components/ScreenContainer";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { KpiTile } from "@/components/KpiTile";
import { Divider, ListRow } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import {
  currentMonth,
  formatDayMonth,
  formatEuros,
  formatMonthTitle,
  formatShortDate,
  monthGrid,
  shiftMonth,
  todayIso,
} from "@/utils/format";
import type { BookingStatus, MemberBookingSummary, MemberState } from "@/api/types";

// D3 del handoff: ficha del socio con mapa de calor mensual, bonos y cobros.
type Tab = "calendario" | "bonos" | "cobros";

const STATE_BADGE: Record<MemberState, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Activa", tone: "good" },
  DELINQUENT: { label: "Moroso", tone: "critical" },
  FROZEN: { label: "Congelado", tone: "warning" },
  TRIAL: { label: "Prueba", tone: "neutral" },
  PROSPECT: { label: "Prospecto", tone: "neutral" },
  CANCELLED: { label: "Baja", tone: "outline" },
};

export default function MemberDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("calendario");
  const [month, setMonth] = useState(currentMonth());
  const { data, isLoading, isError, refetch, isRefetching } = useMemberDetail(id);
  const calendar = useMemberCalendarOf(id, month);

  const statusByDay = useMemo(() => {
    const map = new Map<string, BookingStatus>();
    for (const entry of calendar.data?.entries ?? []) {
      const previous = map.get(entry.day);
      // Un día con varias sesiones se pinta por la más "fuerte": no presentada
      // manda sobre realizada, y realizada sobre reservada.
      if (!previous || rank(entry.status) > rank(previous)) map.set(entry.day, entry.status);
    }
    return map;
  }, [calendar.data]);

  function rank(status: BookingStatus) {
    if (status === "NO_SHOW") return 3;
    if (status === "ATTENDED") return 2;
    if (status === "BOOKED" || status === "WAITLISTED") return 1;
    return 0;
  }

  function cellColor(day: string | null): string {
    if (!day) return theme.sheet;
    const status = statusByDay.get(day);
    if (status === "ATTENDED") return theme.mode === "dark" ? "#333D1A" : theme.goodBg;
    if (status === "NO_SHOW") return "rgba(224,130,103,.4)";
    if (status === "BOOKED" || status === "WAITLISTED") return day <= todayIso() ? theme.gold : "rgba(200,171,114,.45)";
    return theme.surfaceAlt;
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={10}
          onPress={() => router.back()}
          style={[styles.iconButton, { borderColor: theme.border }]}
        >
          <Icon name="chevron-left" size={16} color={theme.text} />
        </Pressable>
        <Text style={[typo.kicker, { color: theme.textMuted }]}>FICHA DE SOCIO</Text>
      </View>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar la ficha" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <FadeInUp>
            <HeroCard>
              <View style={styles.heroRow}>
                <Avatar name={data.member.name} uri={data.member.photoUrl} size={56} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[styles.heroName, { color: theme.onInk.text }]} numberOfLines={2}>
                    {data.member.name}
                  </Text>
                  <Text style={[typo.rowMeta, { color: theme.onInk.secondary }]} numberOfLines={2}>
                    {data.member.centerName} · alta {formatShortDate(`${data.member.joinedAt}T00:00:00`)}
                  </Text>
                  <View style={styles.badgeRow}>
                    <Badge label={STATE_BADGE[data.member.state].label} tone={STATE_BADGE[data.member.state].tone} />
                    {data.member.planNames.slice(0, 2).map((plan) => (
                      <Badge key={plan} label={plan} tone="gold" />
                    ))}
                  </View>
                </View>
              </View>
            </HeroCard>
          </FadeInUp>

          <View style={styles.tabsRow}>
            {(["calendario", "bonos", "cobros"] as Tab[]).map((option) => {
              const selected = tab === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setTab(option)}
                  style={[
                    styles.pill,
                    { backgroundColor: selected ? theme.ink : theme.surface, borderColor: selected ? "transparent" : theme.border },
                  ]}
                >
                  <Text style={[typo.buttonSmall, { color: selected ? theme.inkText : theme.textSecondary }]}>
                    {option === "calendario" ? "Calendario" : option === "bonos" ? "Bonos" : "Cobros"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.kpiRow}>
            <KpiTile label="Realizadas" value={`${data.stats.attended}`} tone="good" small />
            <KpiTile label="Reservadas" value={`${data.stats.booked}`} tone="gold" small />
            <KpiTile label="No-show" value={`${data.stats.noShow}`} tone="critical" small />
          </View>

          {tab === "calendario" ? (
            <>
              <View style={styles.monthHeader}>
                <Text style={[typo.cardTitleSmall, { color: theme.text, flex: 1 }]}>{formatMonthTitle(month)}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mes anterior"
                  onPress={() => setMonth((m) => shiftMonth(m, -1))}
                  style={[styles.iconButton, { borderColor: theme.border }]}
                >
                  <Icon name="chevron-left" size={15} color={theme.text} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Mes siguiente"
                  onPress={() => setMonth((m) => shiftMonth(m, 1))}
                  style={[styles.iconButton, { borderColor: theme.border }]}
                >
                  <Icon name="chevron-right" size={15} color={theme.text} />
                </Pressable>
              </View>

              <Card padding={12} style={{ gap: 6 }}>
                {monthGrid(month).map((week, weekIndex) => (
                  <View key={weekIndex} style={styles.heatRow}>
                    {week.map((day, dayIndex) => (
                      <View
                        key={day ?? `empty-${weekIndex}-${dayIndex}`}
                        accessible
                        accessibilityLabel={day ? `${day}` : undefined}
                        style={[styles.heatCell, { backgroundColor: cellColor(day) }]}
                      />
                    ))}
                  </View>
                ))}
                <Text style={[typo.rowMetaSmall, { color: theme.textMuted, marginTop: 4 }]}>
                  {calendar.data
                    ? `${calendar.data.summary.attended} realizadas · ${calendar.data.summary.booked} reservadas · ${calendar.data.summary.noShow} no presentadas`
                    : "Cargando el mes…"}
                </Text>
              </Card>

              {data.upcoming.length > 0 ? (
                <>
                  <Text style={[typo.kicker, { color: theme.textMuted }]}>PRÓXIMAS</Text>
                  {data.upcoming.map((entry) => (
                    <BookingRow key={entry.bookingId} entry={entry} />
                  ))}
                </>
              ) : null}

              {data.recent.length > 0 ? (
                <>
                  <Text style={[typo.kicker, { color: theme.textMuted }]}>RECIENTES</Text>
                  {data.recent.map((entry) => (
                    <BookingRow key={entry.bookingId} entry={entry} />
                  ))}
                </>
              ) : null}
            </>
          ) : null}

          {tab === "bonos" ? (
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              {data.memberships.length === 0 ? (
                <Text style={[typo.rowMeta, { color: theme.textMuted, padding: 16 }]}>Sin bonos contratados.</Text>
              ) : (
                data.memberships.map((membership, index) => (
                  <View key={membership.id} style={{ paddingHorizontal: 14 }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={membership.planName}
                      meta={`${membership.centerName}${membership.renewsAt ? ` · renueva ${formatDayMonth(`${membership.renewsAt}T00:00:00`)}` : ""}`}
                      right={
                        <View style={{ alignItems: "flex-end", gap: 3 }}>
                          <Text style={[styles.value, { color: theme.text }]}>
                            {membership.total ? `${membership.remaining ?? 0}/${membership.total}` : "∞"}
                          </Text>
                          <Badge
                            label={membership.status === "ACTIVE" ? "Activo" : membership.status}
                            tone={membership.status === "ACTIVE" ? "good" : "warning"}
                          />
                        </View>
                      }
                    />
                  </View>
                ))
              )}
            </Card>
          ) : null}

          {tab === "cobros" ? (
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              {data.payments.length === 0 ? (
                <Text style={[typo.rowMeta, { color: theme.textMuted, padding: 16 }]}>Sin cobros registrados.</Text>
              ) : (
                data.payments.map((payment, index) => (
                  <View key={payment.id} style={{ paddingHorizontal: 14 }}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={formatEuros(payment.amountCents, { decimals: true })}
                      meta={`${formatShortDate(`${payment.date}T00:00:00`)} · ${payment.method}`}
                      right={
                        <Badge
                          label={payment.status === "PAID" ? "Cobrado" : payment.status === "REFUNDED" ? "Devuelto" : "Pendiente"}
                          tone={payment.status === "PAID" ? "good" : payment.status === "REFUNDED" ? "neutral" : "critical"}
                        />
                      }
                    />
                  </View>
                ))
              )}
            </Card>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

function BookingRow({ entry }: { entry: MemberBookingSummary }) {
  const theme = useTheme();
  const color =
    entry.status === "ATTENDED"
      ? theme.good
      : entry.status === "NO_SHOW"
        ? theme.critical
        : entry.status === "CANCELLED"
          ? theme.textFaint
          : theme.gold;

  return (
    <Card padding={0} style={styles.entryCard}>
      <View style={[styles.entryBar, { backgroundColor: color }]} />
      <View style={styles.entryBody}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[typo.rowTitleSmall, { color: theme.text }]} numberOfLines={1}>
            {entry.sessionName}
          </Text>
          <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]} numberOfLines={1}>
            {formatDayMonth(`${entry.day}T00:00:00`)} · {entry.startTime}–{entry.endTime}
            {entry.feedbackAvg != null ? ` · feedback ${entry.feedbackAvg.toLocaleString("es-ES")} / 10` : ""}
          </Text>
        </View>
        <Badge
          label={
            entry.status === "ATTENDED"
              ? "Realizada"
              : entry.status === "NO_SHOW"
                ? "No presentada"
                : entry.status === "CANCELLED"
                  ? "Cancelada"
                  : "Reservada"
          }
          tone={
            entry.status === "ATTENDED"
              ? "good"
              : entry.status === "NO_SHOW"
                ? "critical"
                : entry.status === "CANCELLED"
                  ? "outline"
                  : "gold"
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: { width: 34, height: 34, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroName: { fontFamily: fonts.bold, fontSize: 18 },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 },
  tabsRow: { flexDirection: "row", gap: 8 },
  pill: { flex: 1, height: 38, borderRadius: radii.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  kpiRow: { flexDirection: "row", gap: 10 },
  monthHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  heatRow: { flexDirection: "row", justifyContent: "space-between" },
  heatCell: { width: 26, height: 26, borderRadius: 7 },
  entryCard: { flexDirection: "row", overflow: "hidden" },
  entryBar: { width: 3 },
  entryBody: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13, flex: 1 },
  value: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
});
