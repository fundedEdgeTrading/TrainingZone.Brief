import { useMemo, useState } from "react";
import { Alert, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAgenda, useCancelBooking } from "@/api/queries";
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
import { Countdown, formatCompact, useCountdown } from "@/components/Countdown";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { formatDayLabel } from "@/utils/format";
import type { UpcomingBooking } from "@/api/types";

// B3 del handoff: "Mis sesiones" con la cuenta atrás en vivo de la próxima.
export default function MySessionsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading, isError, refetch, isRefetching } = useAgenda();
  const cancelBooking = useCancelBooking();

  const bookings = useMemo(
    () => (data?.upcomingBookings ?? []).filter((b) => !b.sessionCancelled),
    [data]
  );
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

  /**
   * "Añadir al calendario" sin módulo nativo de calendario: se abre el
   * formulario de evento del calendario web en el navegador del dispositivo,
   * con los datos ya rellenos.
   */
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
        <ScreenHeader
          kicker="MIS SESIONES"
          title="Lo que tienes reservado"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir mi calendario"
              onPress={() => router.push("/calendario")}
              style={[styles.iconButton, { borderColor: theme.border }]}
            >
              <Icon name="grid" size={18} color={theme.text} />
            </Pressable>
          }
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} />
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
          <FadeInUp delay={stagger(1)}>
            <NextSessionHero booking={next} onCancel={() => confirmCancel(next)} onAddToCalendar={() => addToCalendar(next)} />
          </FadeInUp>

          {later.length > 0 ? (
            <>
              <SectionTitle label="Más adelante" />
              {later.map((booking, index) => (
                <FadeInUp key={booking.bookingId} delay={stagger(index + 2)}>
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
    <HeroCard>
      <View style={styles.heroKickerRow}>
        <View style={[styles.dot, { backgroundColor: live ? theme.good : theme.gold }]} />
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
  iconButton: { width: 38, height: 38, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroKickerRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  heroDivider: { height: 1, marginVertical: 14 },
  heroTrainerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 16 },
  laterCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  dateBlock: { width: 44, height: 46, borderRadius: radii.chip, alignItems: "center", justifyContent: "center" },
  dateWeekday: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.8 },
  dateNumber: { fontFamily: fonts.bold, fontSize: 16, ...tabular },
  remaining: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
  footerCard: { alignItems: "center", paddingVertical: 14 },
});
