import { useEffect, useMemo, useState } from "react";
import { Animated, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useAgenda, useBookSession, useCancelBooking } from "@/api/queries";
import { useAuth } from "@/auth/auth-context";
import { useTheme, radii } from "@/theme/theme";
import { typo, fonts, tabular } from "@/theme/typography";
import { barGrow, easeOutSoft, stagger, useReducedMotion } from "@/theme/motion";
import { useCountUp } from "@/theme/use-count-up";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Chip, ChipRow } from "@/components/Chip";
import { DayStrip, nextDays } from "@/components/DayStrip";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { Divider } from "@/components/Row";
import { formatDayLabel, minutesOf, todayIso } from "@/utils/format";
import type { BookableSession, SessionBalance } from "@/api/types";

// B1 + B2 del handoff: reservar sesión y la hoja de confirmación.
type Filter = "all" | "EP" | "GROUP";

const BALANCE_LABEL: Record<string, string> = { EP: "Personal", GROUP: "Grupos", ONLINE: "Online" };

function kindOf(session: { classType: string }): "EP" | "GROUP" {
  return session.classType === "Personal Training" ? "EP" : "GROUP";
}

export default function AgendaScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { state } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useAgenda();
  const bookSession = useBookSession();
  const cancelBooking = useCancelBooking();
  const [day, setDay] = useState(todayIso());
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState<BookableSession | null>(null);

  // La ventana de reserva del backend son 7 días (BOOKING_WINDOW_DAYS): la
  // tira los muestra todos, también los que hoy no tienen nada reservable.
  const days = useMemo(() => nextDays(7), []);
  const selectedDay = days.includes(day) ? day : days[0];

  const sessions = useMemo(
    () =>
      (data?.sessions ?? [])
        .filter((s) => s.occurrenceDate === selectedDay)
        .filter((s) => (filter === "all" ? true : kindOf(s) === filter))
        .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime)),
    [data, selectedDay, filter]
  );

  async function confirmBooking(session: BookableSession) {
    setConfirming(null);
    try {
      const result = await bookSession.mutateAsync({ sessionId: session.id, occurrenceDate: session.occurrenceDate });
      toast.show(result.waitlisted ? "Estás en la lista de espera." : "¡Reserva confirmada!", "good");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo reservar.", "critical");
    }
  }

  async function cancel(bookingId: string) {
    try {
      await cancelBooking.mutateAsync(bookingId);
      toast.show("Reserva cancelada.");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo cancelar.", "critical");
    }
  }

  const centerName = state.status === "signedIn" ? state.user.member?.centerName : undefined;
  const busy = bookSession.isPending || cancelBooking.isPending;

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker={centerName ? `RESERVAR · ${centerName}` : "RESERVAR"} title="Elige tu sesión" />
      </FadeInUp>

      {data && data.balances.length > 0 ? (
        <>
          <FadeInUp delay={stagger(1)} style={styles.balanceRow}>
            {data.balances.map((balance) => (
              <BalanceCard key={balance.serviceKind} balance={balance} />
            ))}
          </FadeInUp>
          {/* El aviso de saldo bajo va ANTES de la lista: enterarse de que no
              te quedan sesiones después de elegir una es la peor forma. */}
          {data.balances.some((b) => !b.unlimited && (b.remaining ?? 0) <= 1) ? (
            <View style={[styles.notice, { backgroundColor: theme.goldBg }]}>
              <View style={[styles.noticeDot, { backgroundColor: theme.gold }]} />
              <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>
                Te queda poco saldo en alguno de tus bonos. Puedes ampliarlo desde «Más».
              </Text>
            </View>
          ) : null}
        </>
      ) : null}

      <FadeInUp delay={stagger(2)}>
        <DayStrip days={days} value={selectedDay} onChange={setDay} />
      </FadeInUp>

      <FadeInUp delay={stagger(3)}>
        <ChipRow>
          <Chip label="Todo" selected={filter === "all"} onPress={() => setFilter("all")} />
          <Chip label="Personal" selected={filter === "EP"} onPress={() => setFilter("EP")} />
          <Chip label="Grupo reducido" selected={filter === "GROUP"} onPress={() => setFilter("GROUP")} />
        </ChipRow>
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={4} shape="row" note="Cargando lo que puedes reservar…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar la agenda" description="Desliza hacia abajo para reintentar." />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Sin sesiones ese día"
          description="Prueba con otro día o quita el filtro para ver todo lo reservable."
        />
      ) : (
        <View style={{ gap: 11 }}>
          <Text style={[typo.kicker, { color: theme.textMuted }]}>{formatDayLabel(`${selectedDay}T00:00:00`)}</Text>
          {sessions.map((session, index) => (
            <FadeInUp key={session.key} delay={stagger(index)}>
              <SessionRow
                session={session}
                busy={busy}
                onBook={() => setConfirming(session)}
                onCancel={session.myBookingId ? () => cancel(session.myBookingId as string) : undefined}
              />
            </FadeInUp>
          ))}
        </View>
      )}

      <ConfirmSheet
        session={confirming}
        balances={data?.balances ?? []}
        loading={bookSession.isPending}
        onClose={() => setConfirming(null)}
        onConfirm={confirmBooking}
      />
    </ScreenContainer>
  );
}

function BalanceCard({ balance }: { balance: SessionBalance }) {
  const theme = useTheme();
  const empty = !balance.unlimited && (balance.remaining ?? 0) <= 0;
  const color = balance.unlimited ? theme.good : empty ? theme.critical : balance.serviceKind === "EP" ? theme.gold : theme.text;
  const remaining = useCountUp(balance.remaining ?? 0);

  return (
    <Card style={styles.balanceCard} padding={14}>
      <Text style={[typo.kpiLabel, { color: theme.textMuted }]}>{BALANCE_LABEL[balance.serviceKind] ?? balance.serviceKind}</Text>
      <View style={styles.balanceValueRow}>
        <Text style={[typo.kpi, { color }]}>{balance.unlimited ? "∞" : remaining}</Text>
        {balance.total != null ? <Text style={[styles.balanceTotal, { color: theme.textFaint }]}>/{balance.total}</Text> : null}
      </View>
      <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
        {balance.unlimited ? "Sesiones sin límite" : "Sesiones disponibles"}
      </Text>
    </Card>
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
  const kind = kindOf(session);
  const full = session.bookedCount >= session.capacity && !session.myBookingId;
  const durationMin = Math.max(0, minutesOf(session.endTime) - minutesOf(session.startTime));

  const occupancy = session.capacity > 0 ? Math.min(1, session.bookedCount / session.capacity) : 0;
  const waiting = Math.max(0, session.bookedCount - session.capacity);

  // La barra de aforo CRECE desde la izquierda en vez de aparecer pintada: es
  // el único dato de la fila que se lee por su longitud, y verla llenarse es
  // lo que la distingue de una raya decorativa. Entra después de la fila
  // (240 ms de delay) para que no compita con el nombre de la sesión.
  const reduced = useReducedMotion();
  const [grow] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) {
      grow.setValue(1);
      return;
    }
    const animation = Animated.timing(grow, {
      toValue: 1,
      duration: barGrow.duration,
      delay: barGrow.delay,
      easing: easeOutSoft,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [grow, reduced]);

  return (
    <Card
      tone={session.myBookingId ? "accent" : "default"}
      style={[styles.sessionCard, full && !session.myBookingId ? { opacity: 0.72 } : null]}
      padding={14}
    >
      <View style={styles.timeColumn}>
        <Text style={[styles.time, { color: theme.text }]}>{session.startTime}</Text>
        <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>{durationMin} min</Text>
      </View>
      <View style={[styles.verticalRule, { backgroundColor: theme.separator }]} />

      <View style={{ flex: 1, gap: 6 }}>
        {session.myBookingId ? (
          <Badge label={session.myBookingStatus === "WAITLISTED" ? "En espera" : "Reservada"} tone="gold" />
        ) : null}
        <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={2}>
          {session.name}
        </Text>
        <View style={styles.trainerRow}>
          <Avatar name={session.trainerName ?? "Training Zone"} uri={session.trainerImage} size={22} />
          <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {session.trainerName ?? "Sin entrenador"}
            {session.room ? ` · ${session.room}` : ` · ${session.centerName}`}
          </Text>
        </View>

        {/* La ocupación como BARRA y no como texto: «5/6» obliga a hacer la
            resta; la barra dice de un vistazo si queda sitio. En EP no hay
            aforo que enseñar (siempre es 1 plaza). */}
        {kind === "GROUP" ? (
          <View style={styles.occupancyRow}>
            <View style={[styles.occupancyTrack, { backgroundColor: theme.surfaceAlt }]}>
              <Animated.View
                style={[
                  styles.occupancyFill,
                  {
                    width: `${occupancy * 100}%`,
                    backgroundColor: full ? theme.critical : theme.gold,
                    transform: [{ scaleX: grow }],
                  },
                ]}
              />
            </View>
            <Text style={[styles.occupancyText, { color: full ? theme.critical : theme.textMuted }]}>
              {Math.min(session.bookedCount, session.capacity)}/{session.capacity}
            </Text>
          </View>
        ) : null}
        {full && waiting > 0 ? (
          <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>
            {waiting} {waiting === 1 ? "persona" : "personas"} en lista de espera
          </Text>
        ) : null}
      </View>

      {session.myBookingId ? (
        // El botón decía «En espera» y lo que hacía era CANCELAR: parecía un
        // distintivo de estado (que ya lo da el badge de arriba) y sacaba al
        // socio de la lista al tocarlo. Ahora dice lo que hace.
        <Button
          title={session.myBookingStatus === "WAITLISTED" ? "Salir" : "Cancelar"}
          variant="outline"
          size="sm"
          loading={busy}
          onPress={onCancel}
        />
      ) : (
        <Button
          title={full ? "Esperar" : "Reservar"}
          variant={full ? "outline" : "primary"}
          size="sm"
          disabled={!session.canBook}
          onPress={onBook}
        />
      )}
    </Card>
  );
}

/** B2: hoja de confirmación con el detalle de lo que se va a consumir. */
function ConfirmSheet({
  session,
  balances,
  loading,
  onClose,
  onConfirm,
}: {
  session: BookableSession | null;
  balances: SessionBalance[];
  loading: boolean;
  onClose: () => void;
  onConfirm: (session: BookableSession) => void;
}) {
  const theme = useTheme();
  if (!session) return null;

  const kind = kindOf(session);
  const balance = balances.find((b) => b.serviceKind === kind);
  const remainingAfter = balance && !balance.unlimited ? Math.max(0, (balance.remaining ?? 0) - 1) : null;
  const full = session.bookedCount >= session.capacity;

  return (
    <Sheet
      visible
      onClose={onClose}
      kicker={full ? "LISTA DE ESPERA" : "CONFIRMAR RESERVA"}
      title={session.name}
      footer={
        <View style={{ gap: 8 }}>
          <Button
            title={full ? "Unirse a la espera" : "Confirmar reserva"}
            variant="gold"
            size="lg"
            loading={loading}
            onPress={() => onConfirm(session)}
          />
          <Button title="Ahora no" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      <View style={styles.trainerRow}>
        <Avatar name={session.trainerName ?? "Training Zone"} uri={session.trainerImage} size={36} />
        <View>
          <Text style={[typo.rowTitle, { color: theme.text }]}>{session.trainerName ?? "Sin entrenador asignado"}</Text>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{session.centerName}</Text>
        </View>
      </View>

      <Card tone="alt" padding={0} style={{ gap: 0 }}>
        <SheetRow label="Día" value={formatDayLabel(`${session.occurrenceDate}T00:00:00`)} />
        <Divider />
        <SheetRow label="Hora" value={`${session.startTime} – ${session.endTime}`} />
        <Divider />
        <SheetRow label="Plazas" value={`${session.bookedCount}/${session.capacity}`} />
        <Divider />
        <SheetRow
          label="Bono"
          value={
            balance?.unlimited
              ? "Sin consumo (bono ilimitado)"
              : remainingAfter != null
                ? `${kind === "EP" ? "Personal" : "Grupos"} · quedarán ${remainingAfter}`
                : "Sin bono asociado"
          }
          accent
        />
      </Card>

      <View style={[styles.notice, { backgroundColor: theme.warningBg }]}>
        <View style={[styles.noticeDot, { backgroundColor: theme.warning }]} />
        <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>
          {session.canCancelFreely
            ? "Cancelación gratuita hasta 12 h antes. Después se consume la sesión del bono."
            : "Estás dentro de las 12 h previas: si cancelas, la sesión se consume igualmente."}
        </Text>
      </View>
    </Sheet>
  );
}

function SheetRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.sheetRow}>
      <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[typo.rowTitleSmall, { color: accent ? theme.goldText : theme.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  balanceRow: { flexDirection: "row", gap: 10 },
  balanceCard: { flex: 1, gap: 2 },
  balanceValueRow: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  balanceTotal: { fontFamily: fonts.semibold, fontSize: 13, ...tabular },
  sessionCard: { flexDirection: "row", alignItems: "center", gap: 12 },
  timeColumn: { width: 52, gap: 1 },
  time: { fontFamily: fonts.bold, fontSize: 15, ...tabular },
  verticalRule: { width: 1, alignSelf: "stretch" },
  occupancyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  occupancyTrack: { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  // `transformOrigin` es lo que hace que `scaleX` crezca desde la izquierda:
  // por defecto RN escala desde el CENTRO y la barra se abriría hacia los dos
  // lados, que es justo lo contrario de lo que cuenta un aforo.
  occupancyFill: { height: 4, borderRadius: 2, transformOrigin: "left" },
  occupancyText: { fontFamily: fonts.bold, fontSize: 11, ...tabular },
  trainerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sheetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14 },
  notice: { flexDirection: "row", gap: 9, borderRadius: radii.control, padding: 12, alignItems: "flex-start" },
  noticeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
});
