import { Alert, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "@/auth/auth-context";
import { useActivity, useAgenda, useCancelBooking, useNotifications } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { Countdown, useCountdown } from "@/components/Countdown";
import { ListRow } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonScreen } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { SessionBalance, UpcomingBooking } from "@/api/types";

const LIGHT_COLOR: Record<string, "critical" | "warning" | "good"> = { RED: "critical", AMBER: "warning", GREEN: "good" };

/**
 * «Hoy» del socio. Antes esta pantalla se llamaba «Mi actividad» y abría con
 * tres KPI históricos —este mes, este año, histórico— y una gráfica de seis
 * meses. Eso responde a «¿cómo voy?», que es una pregunta de balance mensual,
 * no de las 8 de la mañana.
 *
 * Lo que un socio abre la app para saber es CUÁNDO es su próxima sesión y qué
 * hace con ella. Por eso el héroe es ahora la cuenta atrás con sus dos acciones
 * (añadir al calendario y cancelar), el saldo va debajo, y la constancia baja a
 * una fila que lleva a Evolución, donde vive la gráfica.
 */
export default function MemberTodayScreen() {
  const { state } = useAuth();
  const theme = useTheme();
  const toast = useToast();
  const activity = useActivity();
  const agenda = useAgenda();
  const notifications = useNotifications();
  const cancelBooking = useCancelBooking();

  const firstName = state.status === "signedIn" ? state.user.name.split(" ")[0] : "";
  const unread = (notifications.data?.notifications ?? []).filter((n) => !n.resolvedAt).length;
  const next = (agenda.data?.upcomingBookings ?? []).find((b) => !b.sessionCancelled) ?? null;
  const balances = agenda.data?.balances ?? [];
  const loading = activity.isLoading || agenda.isLoading;

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
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={activity.isRefetching || agenda.isRefetching}
          onRefresh={() => {
            activity.refetch();
            agenda.refetch();
          }}
          tintColor={theme.gold}
        />
      }
    >
      <FadeInUp>
        <ScreenHeader
          kicker="HOY"
          title={`Hola, ${firstName}`}
          tight
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unread ? `Avisos, ${unread} sin leer` : "Avisos"}
              onPress={() => router.push("/notificaciones")}
              style={[styles.iconButton, { borderColor: theme.border }]}
            >
              <Icon name="bell" size={17} color={theme.text} />
              {unread > 0 ? <View style={[styles.unreadDot, { backgroundColor: theme.critical }]} /> : null}
            </Pressable>
          }
        />
      </FadeInUp>

      {loading ? (
        <SkeletonScreen note="Cargando tu día…" />
      ) : activity.isError || !activity.data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu actividad" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {next ? (
            <FadeInUp delay={stagger(1)}>
              <NextSessionHero
                booking={next}
                onCancel={() => confirmCancel(next)}
                onAddToCalendar={() => addToCalendar(next)}
              />
            </FadeInUp>
          ) : (
            <FadeInUp delay={stagger(1)}>
              <Card tone="dashed" style={styles.emptyHero}>
                <Icon name="calendar" size={22} color={theme.textFaint} />
                <Text style={[typo.cardTitleSmall, { color: theme.text }]}>Sin sesiones reservadas</Text>
                <Button title="Reservar ahora" variant="gold" size="sm" onPress={() => router.push("/agenda")} />
              </Card>
            </FadeInUp>
          )}

          {balances.length > 0 ? (
            <FadeInUp delay={stagger(2)} style={styles.balanceRow}>
              {balances.map((balance) => (
                <BalanceCard key={balance.serviceKind} balance={balance} />
              ))}
            </FadeInUp>
          ) : null}

          {activity.data.healthTransparency.length > 0 ? (
            <FadeInUp delay={stagger(3)}>
              <Card style={{ gap: 12 }}>
                <Text style={[typo.cardTitleSmall, { color: theme.text }]}>Lo que adapta tu entrenador</Text>
                {activity.data.healthTransparency.map((item, index) => (
                  <View key={index} style={styles.adaptationRow}>
                    <View style={[styles.dot, { backgroundColor: theme[LIGHT_COLOR[item.light]] }]} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[typo.rowTitleSmall, { color: theme.text }]}>{item.blockArea}</Text>
                      {item.adaptation ? (
                        <Text style={[typo.rowMeta, { color: theme.textMuted, lineHeight: 17 }]}>{item.adaptation}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            </FadeInUp>
          ) : null}

          {/* La gráfica de 6 meses vive en Evolución, que es su pestaña: aquí
              solo el acceso, con la cifra que da sentido a entrar. */}
          <FadeInUp delay={stagger(4)}>
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              <View style={styles.listInset}>
                <ListRow
                  left={<Icon name="chart" size={19} color={theme.gold} />}
                  title="Tu constancia"
                  meta={`${activity.data.progress.totalThisMonth} este mes · ${activity.data.progress.totalThisYear} este año`}
                  chevron
                  onPress={() => router.push("/evolucion")}
                />
              </View>
            </Card>
          </FadeInUp>
        </>
      )}
    </ScreenContainer>
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
        <View style={[styles.dot7, { backgroundColor: live ? theme.good : theme.gold }]} />
        <Text style={[typo.kicker, { color: theme.onInk.muted }]}>{live ? "EN CURSO" : "TU PRÓXIMA SESIÓN"}</Text>
      </View>

      <Countdown targetIso={booking.startsAt} format="clock" style={[typo.hero, { color: theme.onInk.text }]} />
      <Text style={[typo.legend, { color: theme.onInk.muted }]}>Horas · Minutos · Segundos</Text>

      <View style={[styles.heroDivider, { backgroundColor: "rgba(244,240,232,.14)" }]} />

      <Text style={[typo.cardTitle, { color: theme.onInk.text }]} numberOfLines={2}>
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

function BalanceCard({ balance }: { balance: SessionBalance }) {
  const theme = useTheme();
  const label = balance.serviceKind === "EP" ? "Personal" : balance.serviceKind === "GROUP" ? "Grupos" : "Online";
  const empty = !balance.unlimited && (balance.remaining ?? 0) <= 0;
  const color = balance.unlimited ? theme.good : empty ? theme.critical : theme.gold;

  return (
    <Card style={styles.balanceCard} padding={14}>
      <Text style={[typo.kpiLabel, { color: theme.textMuted }]}>{label}</Text>
      <View style={styles.balanceValueRow}>
        <Text style={[typo.kpi, { color }]}>{balance.unlimited ? "∞" : (balance.remaining ?? 0)}</Text>
        {balance.total != null ? <Text style={[styles.balanceTotal, { color: theme.textFaint }]}>/{balance.total}</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  unreadDot: { position: "absolute", top: 9, right: 10, width: 7, height: 7, borderRadius: 4 },
  heroKickerRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  dot7: { width: 7, height: 7, borderRadius: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  heroDivider: { height: 1, marginVertical: 14 },
  heroTrainerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  emptyHero: { alignItems: "center", gap: 10, paddingVertical: 26 },
  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: { flex: 1, gap: 2 },
  balanceValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  balanceTotal: { fontFamily: fonts.semibold, fontSize: 13, ...tabular },
  adaptationRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  listInset: { paddingHorizontal: 14 },
});
