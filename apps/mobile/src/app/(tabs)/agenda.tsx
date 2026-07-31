import { useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useAgenda, useBookSession, useCancelBooking } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { formatDayLabel } from "@/utils/format";
import type { BookableSession } from "@/api/types";

const SERVICE_LABEL: Record<string, string> = { EP: "Entrenamiento personal", GROUP: "Grupos reducidos", ONLINE: "Online" };

export default function AgendaScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useAgenda();
  const bookMutation = useBookSession();
  const cancelMutation = useCancelBooking();
  const [feedback, setFeedback] = useState<string | null>(null);

  const grouped = useMemo(() => {
    if (!data) return [];
    const byDay = new Map<string, BookableSession[]>();
    for (const s of data.sessions) {
      const key = formatDayLabel(s.date);
      byDay.set(key, [...(byDay.get(key) ?? []), s]);
    }
    return [...byDay.entries()];
  }, [data]);

  async function handleBook(sessionId: string) {
    setFeedback(null);
    try {
      const result = await bookMutation.mutateAsync(sessionId);
      setFeedback(result.waitlisted ? "Añadido a la lista de espera." : "¡Reserva confirmada!");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "No se pudo reservar.");
    }
  }

  async function handleCancel(bookingId: string) {
    setFeedback(null);
    try {
      await cancelMutation.mutateAsync(bookingId);
      setFeedback("Reserva cancelada.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "No se pudo cancelar.");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <FadeInUp>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>RESERVAR CLASE</Text>
        <Text style={[styles.title, { color: theme.text }]}>Próximos 7 días</Text>
      </FadeInUp>

      {feedback ? (
        <Card style={{ paddingVertical: 10 }}>
          <Text style={{ color: theme.text, fontFamily: "Poppins_500Medium", fontSize: 13 }}>{feedback}</Text>
        </Card>
      ) : null}

      {data && data.balances.length > 0 ? (
        <FadeInUp delay={60} style={styles.balanceRow}>
          {data.balances.map((b) => (
            <Card key={b.serviceKind} style={styles.balanceCard}>
              <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>{SERVICE_LABEL[b.serviceKind] ?? b.serviceKind}</Text>
              <Text style={[styles.balanceValue, { color: b.unlimited ? theme.good : (b.remaining ?? 0) <= 0 ? theme.critical : theme.text }]}>
                {b.unlimited ? "∞" : (b.remaining ?? 0)}
              </Text>
              {b.used != null && b.total != null ? (
                <Text style={[styles.balanceHint, { color: theme.textMuted }]}>
                  {b.used} gastadas de {b.total}
                </Text>
              ) : null}
            </Card>
          ))}
        </FadeInUp>
      ) : null}

      {/* Todas las reservas vivas, también las de fuera de los próximos 7 días. */}
      {data && data.upcomingBookings.length > 0 ? (
        <View style={{ gap: 10 }}>
          <View style={styles.upcomingHeader}>
            <Text style={[styles.dayLabel, { color: theme.text }]}>Tus próximas reservas</Text>
            <Badge
              label={`${data.upcomingBookings.length} ${data.upcomingBookings.length === 1 ? "reserva" : "reservas"}`}
              tone="neutral"
            />
          </View>
          {data.upcomingBookings.map((b) => (
            <Card key={b.bookingId}>
              <View style={styles.sessionHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sessionName, { color: theme.text }]}>{b.sessionName}</Text>
                  <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>
                    {b.dayLabel} · {b.startTime} · {b.centerName}
                  </Text>
                </View>
                {b.sessionCancelled ? <Badge label="Anulada" tone="critical" /> : null}
                {b.status === "WAITLISTED" ? <Badge label="En espera" tone="neutral" /> : null}
              </View>
              <View style={styles.sessionFooter}>
                <Text style={[styles.capacity, { color: theme.textMuted }]}>
                  {b.trainerName ?? "Sin entrenador asignado"}
                </Text>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={() => handleCancel(b.bookingId)}
                  loading={cancelMutation.isPending}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar la agenda" description="Desliza hacia abajo para reintentar." />
      ) : grouped.length === 0 ? (
        <EmptyState title="Sin sesiones disponibles" description="No hay sesiones reservables en los próximos 7 días." />
      ) : (
        grouped.map(([day, sessions]) => (
          <View key={day} style={{ gap: 10 }}>
            <Text style={[styles.dayLabel, { color: theme.text }]}>{day}</Text>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onBook={() => handleBook(s.id)}
                onCancel={s.myBookingId ? () => handleCancel(s.myBookingId!) : undefined}
                busy={bookMutation.isPending || cancelMutation.isPending}
              />
            ))}
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

function SessionRow({
  session,
  onBook,
  onCancel,
  busy,
}: {
  session: BookableSession;
  onBook: () => void;
  onCancel?: () => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const full = session.bookedCount >= session.capacity && !session.myBookingId;

  return (
    <Card>
      <View style={styles.sessionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sessionName, { color: theme.text }]}>{session.name}</Text>
          <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>
            {session.startTime}–{session.endTime} · {session.trainerName ?? "Sin entrenador asignado"}
          </Text>
        </View>
        <Badge label={session.classType} tone="neutral" />
      </View>

      <View style={styles.sessionFooter}>
        <Text style={[styles.capacity, { color: theme.textMuted }]}>
          {session.bookedCount}/{session.capacity} plazas
        </Text>
        {session.myBookingId ? (
          <Button
            title={session.myBookingStatus === "WAITLISTED" ? "En espera · cancelar" : "Cancelar"}
            variant="secondary"
            onPress={onCancel}
            loading={busy}
          />
        ) : (
          <Button
            title={full ? "Unirse a la espera" : "Reservar"}
            onPress={onBook}
            disabled={!session.canBook}
            loading={busy}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: { flex: 1, alignItems: "center", padding: 14 },
  balanceLabel: { fontFamily: "Poppins_500Medium", fontSize: 10, textAlign: "center" },
  balanceValue: { fontFamily: "Poppins_700Bold", fontSize: 22, marginTop: 4 },
  balanceHint: { fontFamily: "Poppins_400Regular", fontSize: 10, marginTop: 2, textAlign: "center" },
  upcomingHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  dayLabel: { fontFamily: "Poppins_700Bold", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5 },
  sessionHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  sessionName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  sessionMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  sessionFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  capacity: { fontFamily: "Poppins_500Medium", fontSize: 12 },
});
