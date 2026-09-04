import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, PanResponder, Pressable, RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  useStaffAgenda,
  useSaveStaffSession,
  useDeleteStaffSession,
  useStaffSessionAttendees,
  useAddStaffBooking,
  useCreateEpSlot,
  useDiscardAttendee,
  useDiscardPreview,
} from "@/api/queries";
import { useAuth } from "@/auth/auth-context";
import { canManageEpSlots } from "@/auth/routes";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Chip, ChipRow } from "@/components/Chip";
import { DayStrip, nextDays } from "@/components/DayStrip";
import { Avatar } from "@/components/Avatar";
import { Segmented } from "@/components/Segmented";
import { Sheet } from "@/components/Sheet";
import { Stepper } from "@/components/Stepper";
import { ToggleRow } from "@/components/ToggleRow";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { addDaysToIso, formatLongDate, minutesOf, todayIso } from "@/utils/format";
import { formatCompact } from "@/components/Countdown";
import type { StaffAgendaResponse, StaffSession, StaffSessionAttendee } from "@/api/types";

// C2 + C3 del handoff: agenda del centro en timeline diaria, con la hoja de
// crear/editar sesión.
const HOUR_HEIGHT = 76;
const DEFAULT_RANGE = { from: 7, to: 22 };

export default function StaffAgendaScreen() {
  const theme = useTheme();
  const toast = useToast();
  const [date, setDate] = useState(todayIso());
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ session: StaffSession | null; startTime?: string } | null>(null);
  const [attendeesOf, setAttendeesOf] = useState<StaffSession | null>(null);
  const [publishingSlot, setPublishingSlot] = useState<{ startTime: string } | null>(null);
  // Los tres modos con los que se mira la agenda: lo mío, todo el centro y los
  // huecos de EP libres. Son preguntas distintas, no un filtro de entrenador
  // más: «¿qué me toca?», «¿qué pasa en la sala?» y «¿qué puedo publicar?».
  const [scope, setScope] = useState<"mine" | "center" | "slots">("mine");
  const { state } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useStaffAgenda(date);
  const deleteSession = useDeleteStaffSession();
  const scrollRef = useRef<ScrollView | null>(null);

  const meId = state.status === "signedIn" ? state.user.id : null;
  const canPublishSlots = state.status === "signedIn" && canManageEpSlots(state.user.role);

  const sessions = useMemo(() => {
    const all = data?.sessions ?? [];
    const byTrainer = trainerId ? all.filter((s) => s.trainerId === trainerId) : all;
    if (scope === "mine" && meId) return byTrainer.filter((s) => s.trainerId === meId);
    if (scope === "slots") {
      // Hueco de EP libre: franja personal autorreservable sin nadie dentro.
      return byTrainer.filter(
        (s) => s.classType === "Personal Training" && s.selfBookable && s.bookings.every((b) => b.status === "CANCELLED")
      );
    }
    return byTrainer;
  }, [data, trainerId, scope, meId]);

  const range = useMemo(() => {
    const starts = sessions.map((s) => Math.floor(minutesOf(s.startTime) / 60));
    const ends = sessions.map((s) => Math.ceil(minutesOf(s.endTime) / 60));
    return {
      from: Math.min(DEFAULT_RANGE.from, ...starts),
      to: Math.max(DEFAULT_RANGE.to, ...ends),
    };
  }, [sessions]);

  // Swipe horizontal para cambiar de día: el gesto solo se reclama cuando el
  // movimiento es claramente horizontal, para no robarle el scroll vertical a
  // la timeline.
  const [swipe] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx <= -40) setDate((d) => addDaysToIso(d, 1));
        else if (gesture.dx >= 40) setDate((d) => addDaysToIso(d, -1));
      },
    })
  );

  const isToday = date === todayIso();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  // Al abrir el día de hoy, la timeline arranca en la hora actual.
  useEffect(() => {
    if (!isToday || isLoading) return;
    const offset = ((nowMinutes - range.from * 60) / 60) * HOUR_HEIGHT;
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, offset - 120), animated: true }), 350);
    return () => clearTimeout(timer);
  }, [isToday, isLoading, nowMinutes, range.from]);

  async function confirmDelete(session: StaffSession) {
    Alert.alert("Eliminar la sesión", `Se eliminará "${session.name}" y sus reservas de ese día.`, [
      { text: "Volver", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSession.mutateAsync(session.id);
            setEditing(null);
            toast.show("Sesión eliminada.");
          } catch (err) {
            toast.show(err instanceof Error ? err.message : "No se pudo eliminar.", "critical");
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}
      >
        <FadeInUp>
          <View style={styles.header}>
            <Text style={[typo.screenTitleTight, { color: theme.text, flex: 1 }]} numberOfLines={2}>
              {formatLongDate(date)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Día anterior"
              onPress={() => setDate((d) => addDaysToIso(d, -1))}
              style={[styles.navButton, { borderColor: theme.border }]}
            >
              <Icon name="chevron-left" size={16} color={theme.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setDate(todayIso())}
              style={[styles.todayButton, { borderColor: theme.border, backgroundColor: isToday ? theme.surfaceAlt : "transparent" }]}
            >
              <Text style={[typo.buttonSmall, { color: theme.text }]}>Hoy</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Día siguiente"
              onPress={() => setDate((d) => addDaysToIso(d, 1))}
              style={[styles.navButton, { borderColor: theme.border }]}
            >
              <Icon name="chevron-right" size={16} color={theme.text} />
            </Pressable>
            {/* El `+` de cabecera además del FAB: con la timeline desplazada,
                el FAB queda lejos del pulgar que acaba de leer la hora. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nueva sesión"
              onPress={() => setEditing({ session: null })}
              style={[styles.navButton, { borderColor: theme.border }]}
            >
              <Icon name="plus" size={16} color={theme.gold} />
            </Pressable>
          </View>
        </FadeInUp>

        <DayStrip days={nextDays(6, new Date(`${todayIso()}T00:00:00`))} value={date} onChange={setDate} />

        <ChipRow>
          <Chip label="Mis sesiones" selected={scope === "mine"} onPress={() => setScope("mine")} />
          <Chip label="Todo el centro" selected={scope === "center"} onPress={() => setScope("center")} />
          <Chip label="Huecos EP" selected={scope === "slots"} onPress={() => setScope("slots")} />
        </ChipRow>

        {data && data.trainers.length > 0 ? (
          <ChipRow>
            <Chip label="Todos" selected={trainerId === null} onPress={() => setTrainerId(null)} />
            {data.trainers.map((trainer) => (
              <Chip
                key={trainer.id}
                label={trainer.name.split(" ")[0]}
                photoName={trainer.name}
                photoUri={trainer.image}
                selected={trainerId === trainer.id}
                onPress={() => setTrainerId((current) => (current === trainer.id ? null : trainer.id))}
              />
            ))}
          </ChipRow>
        ) : null}

        {isLoading ? (
          <SkeletonList rows={3} />
        ) : isError || !data ? (
          <EmptyState icon="alert" title="No se pudo cargar la agenda" description="Desliza hacia abajo para reintentar." />
        ) : (
          <Card tone="alt" padding={0} style={styles.timelineCard} {...swipe.panHandlers}>
            <ScrollView ref={scrollRef} nestedScrollEnabled style={{ maxHeight: HOUR_HEIGHT * 6.5 }}>
              <View style={{ height: (range.to - range.from) * HOUR_HEIGHT, flexDirection: "row" }}>
                <View style={styles.hoursColumn}>
                  {Array.from({ length: range.to - range.from }, (_, i) => {
                    const hour = range.from + i;
                    const current = isToday && Math.floor(nowMinutes / 60) === hour;
                    return (
                      <View key={hour} style={styles.hourCell}>
                        <Text style={[styles.hourLabel, { color: current ? theme.gold : theme.textFaint }]}>
                          {String(hour).padStart(2, "0")}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={{ flex: 1 }}>
                  {Array.from({ length: range.to - range.from }, (_, i) => {
                    const hour = range.from + i;
                    const busy = sessions.some(
                      (s) => minutesOf(s.startTime) < (hour + 1) * 60 && minutesOf(s.endTime) > hour * 60
                    );
                    return (
                      <Pressable
                        key={hour}
                        accessibilityRole="button"
                        accessibilityLabel={`Crear sesión a las ${hour}:00`}
                        disabled={!data.canEdit || busy}
                        onPress={() =>
                          scope === "slots" && canPublishSlots
                            ? setPublishingSlot({ startTime: `${String(hour).padStart(2, "0")}:00` })
                            : setEditing({ session: null, startTime: `${String(hour).padStart(2, "0")}:00` })
                        }
                        style={[styles.hourSlot, { borderTopColor: theme.separator }]}
                      >
                        {!busy && data.canEdit ? (
                          <View style={[styles.freeSlot, { borderColor: theme.separator }]}>
                            <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>Libre</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}

                  {sessions.map((session) => (
                    <TimelineEvent
                      key={session.id}
                      session={session}
                      rangeFrom={range.from}
                      isToday={isToday}
                      nowMinutes={nowMinutes}
                      onPress={() =>
                        session.classType === "Personal Training" ? setEditing({ session }) : setAttendeesOf(session)
                      }
                    />
                  ))}

                  {isToday && nowMinutes >= range.from * 60 && nowMinutes <= range.to * 60 ? (
                    <View
                      pointerEvents="none"
                      style={[styles.nowLine, { top: ((nowMinutes - range.from * 60) / 60) * HOUR_HEIGHT, backgroundColor: theme.critical }]}
                    >
                      <View style={[styles.nowChip, { backgroundColor: theme.critical }]}>
                        <Text style={styles.nowChipText}>
                          {String(Math.floor(nowMinutes / 60)).padStart(2, "0")}:{String(nowMinutes % 60).padStart(2, "0")}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
            </ScrollView>
          </Card>
        )}

        {data && sessions.length === 0 && !isLoading ? (
          <EmptyState
            icon="calendar"
            title={scope === "slots" ? "Sin huecos de EP publicados" : "Sin sesiones ese día"}
            description={
              scope === "slots"
                ? "Toca una hora libre para publicar un hueco que el socio pueda reservar."
                : "Toca un hueco libre para crear la primera."
            }
          />
        ) : null}

        {scope === "slots" && canPublishSlots ? (
          <Card tone="dashed" style={styles.publishCard}>
            <Icon name="plus" size={18} color={theme.gold} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[typo.rowTitleSmall, { color: theme.text }]}>Publicar hueco de EP</Text>
              <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
                Queda autorreservable desde la app del socio.
              </Text>
            </View>
            <Button title="Publicar" variant="gold" size="sm" onPress={() => setPublishingSlot({ startTime: "09:00" })} />
          </Card>
        ) : null}
      </ScreenContainer>

      {data?.canEdit ? (
        <View style={styles.fab} pointerEvents="box-none">
          <Button title="+ Nueva sesión" variant="gold" onPress={() => setEditing({ session: null })} />
        </View>
      ) : null}

      {editing && data ? (
        <SessionSheet
          agenda={data}
          date={date}
          session={editing.session}
          startTime={editing.startTime}
          onClose={() => setEditing(null)}
          onDelete={editing.session ? () => confirmDelete(editing.session as StaffSession) : undefined}
        />
      ) : null}

      {attendeesOf ? (
        <AttendeesSheet
          session={attendeesOf}
          date={date}
          onClose={() => setAttendeesOf(null)}
          onEdit={() => {
            setEditing({ session: attendeesOf });
            setAttendeesOf(null);
          }}
        />
      ) : null}

      {publishingSlot && data ? (
        <EpSlotSheet
          agenda={data}
          date={date}
          startTime={publishingSlot.startTime}
          onClose={() => setPublishingSlot(null)}
        />
      ) : null}
    </View>
  );
}

function TimelineEvent({
  session,
  rangeFrom,
  isToday,
  nowMinutes,
  onPress,
}: {
  session: StaffSession;
  rangeFrom: number;
  isToday: boolean;
  nowMinutes: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const start = minutesOf(session.startTime);
  const end = minutesOf(session.endTime);
  const live = isToday && nowMinutes >= start && nowMinutes < end;
  const active = session.bookings.filter((b) => b.status !== "CANCELLED").length;

  const top = ((start - rangeFrom * 60) / 60) * HOUR_HEIGHT;
  const height = Math.max(40, ((end - start) / 60) * HOUR_HEIGHT - 4);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${session.name}, ${session.startTime} a ${session.endTime}`}
      onPress={onPress}
      style={[styles.event, { top, height, borderColor: live ? theme.gold : theme.border }]}
    >
      <LinearGradient
        colors={live ? ["#3A3427", "#26251F"] : [theme.surface, theme.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.eventBar, { backgroundColor: live ? theme.gold : theme.surfaceAlt }]} />
      <View style={styles.eventBody}>
        <View style={styles.eventTitleRow}>
          <Text style={[styles.eventTitle, { color: live ? "#F4F0E8" : theme.text }]} numberOfLines={1}>
            {session.name}
          </Text>
          {live ? <Badge label="En curso" tone="gold" /> : null}
        </View>
        <Text style={[styles.eventMeta, { color: live ? "#C7C2B4" : theme.textMuted }]} numberOfLines={1}>
          {session.startTime}–{session.endTime} · {session.trainerName ?? "Sin entrenador"}
          {session.room ? ` · ${session.room}` : ""} · {active}/{session.capacity}
        </Text>
      </View>
    </Pressable>
  );
}

/** C3: misma hoja para crear y editar. */
function SessionSheet({
  agenda,
  date,
  session,
  startTime: prefillStart,
  onClose,
  onDelete,
}: {
  agenda: StaffAgendaResponse;
  date: string;
  session: StaffSession | null;
  startTime?: string;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const saveSession = useSaveStaffSession();

  const [title, setTitle] = useState(session?.name ?? "");
  const [type, setType] = useState<"personal" | "reduced">(
    session ? (session.classType === "Personal Training" ? "personal" : "reduced") : "personal"
  );
  const [trainerId, setTrainerId] = useState(session?.trainerId ?? agenda.trainers[0]?.id ?? "");
  const [memberId, setMemberId] = useState<string | null>(
    session?.bookings.find((b) => b.status !== "CANCELLED")?.member.id ?? null
  );
  const [startTime, setStartTime] = useState(session?.startTime ?? prefillStart ?? "09:00");
  const [endTime, setEndTime] = useState(session?.endTime ?? addHour(prefillStart ?? "09:00"));
  const [capacity, setCapacity] = useState(session && session.capacity > 1 ? session.capacity : 6);
  const [weekly, setWeekly] = useState(session?.recurrence === "WEEKLY");
  const [recUntil, setRecUntil] = useState("");
  const [isTrial, setIsTrial] = useState(session?.isTrial ?? false);
  const [error, setError] = useState<string | null>(null);

  function addHour(time: string) {
    const minutes = minutesOf(time) + 60;
    return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  /** Aviso de solape con otra sesión del mismo entrenador o de la misma sala. */
  const overlap = useMemo(() => {
    const start = minutesOf(startTime);
    const end = minutesOf(endTime);
    return agenda.sessions.find(
      (other) =>
        other.id !== session?.id &&
        other.trainerId === trainerId &&
        minutesOf(other.startTime) < end &&
        minutesOf(other.endTime) > start
    );
  }, [agenda.sessions, endTime, session?.id, startTime, trainerId]);

  async function submit() {
    setError(null);
    if (!title.trim()) return setError("La sesión necesita un título.");
    if (!trainerId) return setError("Elige el entrenador que la dirige.");
    if (!agenda.centerId) return setError("No hay centro seleccionado.");
    if (minutesOf(endTime) <= minutesOf(startTime)) return setError("La hora de fin tiene que ser posterior a la de inicio.");
    if (type === "reduced" && capacity < 1) return setError("El aforo mínimo es 1.");

    try {
      await saveSession.mutateAsync({
        id: session?.id,
        centerId: agenda.centerId,
        trainerId,
        title: title.trim(),
        type,
        date,
        startTime,
        endTime,
        memberId: type === "personal" ? memberId : null,
        capacity: type === "reduced" ? capacity : 1,
        isTrial,
        recurrence: weekly ? "WEEKLY" : "NONE",
        recUntil: weekly && recUntil ? recUntil : null,
      });
      toast.show(session ? "Sesión actualizada." : "Sesión creada.", "good");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la sesión.");
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      kicker={session ? "EDITAR" : "NUEVA SESIÓN"}
      title={session ? "Editar sesión" : "Crear sesión"}
      footer={
        <View style={{ gap: 8 }}>
          {error ? <Text style={[typo.rowMeta, { color: theme.critical }]}>{error}</Text> : null}
          <Button
            title={session ? "Guardar cambios" : "Crear sesión"}
            variant="gold"
            size="lg"
            loading={saveSession.isPending}
            onPress={submit}
          />
          {onDelete ? <Button title="Eliminar sesión" variant="danger" onPress={onDelete} /> : null}
        </View>
      }
    >
      <Segmented
        options={[
          { value: "personal", label: "Personal" },
          { value: "reduced", label: "Grupo reducido" },
        ]}
        value={type}
        onChange={setType}
      />

      <Field label="Título" value={title} onChangeText={setTitle} placeholder="Entrenamiento personal" />

      <View style={{ gap: 6 }}>
        <Text style={[typo.label, { color: theme.textSecondary }]}>Entrenador</Text>
        <ChipRow>
          {agenda.trainers.map((trainer) => (
            <Chip
              key={trainer.id}
              label={trainer.name}
              photoName={trainer.name}
              photoUri={trainer.image}
              selected={trainerId === trainer.id}
              onPress={() => setTrainerId(trainer.id)}
            />
          ))}
        </ChipRow>
      </View>

      {type === "personal" ? (
        <View style={{ gap: 6 }}>
          <Text style={[typo.label, { color: theme.textSecondary }]}>Cliente (opcional)</Text>
          <ChipRow>
            {agenda.members.slice(0, 30).map((member) => (
              <Chip
                key={member.id}
                label={`${member.firstName} ${member.lastName}`}
                tone="bone"
                selected={memberId === member.id}
                onPress={() => setMemberId((current) => (current === member.id ? null : member.id))}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}

      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Field label="Inicio" value={startTime} onChangeText={setStartTime} placeholder="09:00" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Fin" value={endTime} onChangeText={setEndTime} placeholder="10:00" keyboardType="numbers-and-punctuation" />
        </View>
        {type === "reduced" ? <Stepper label="Aforo" value={capacity} onChange={setCapacity} min={1} max={12} /> : null}
      </View>

      {overlap ? (
        <View style={[styles.overlap, { backgroundColor: theme.warningBg }]}>
          <View style={[styles.overlapDot, { backgroundColor: theme.warning }]} />
          <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>
            Se solapa con «{overlap.name}» ({overlap.startTime}–{overlap.endTime}) del mismo entrenador.
          </Text>
        </View>
      ) : null}

      <ToggleRow
        label="Repetir cada semana"
        description={weekly ? "Se repetirá el mismo día y hora hasta la fecha límite." : undefined}
        value={weekly}
        onValueChange={setWeekly}
      />
      {weekly ? (
        <Field label="Fecha límite" value={recUntil} onChangeText={setRecUntil} placeholder="2026-12-31" autoCapitalize="none" />
      ) : null}

      <ToggleRow label="Clase de prueba" value={isTrial} onValueChange={setIsTrial} />
    </Sheet>
  );
}

/**
 * «Publicar hueco de EP» (RB-AGENDA-006): una franja personal SIN cliente
 * asignado que el socio se reserva por su cuenta.
 *
 * La leyenda no es decorativa. Un hueco agendado a mano por el entrenador se
 * crea sin bono asociado (`createEpSlot` pone `subscriptionId` a null), así que
 * NO le descuenta sesión a nadie; cuando lo reserva el socio desde su app, sí
 * pasa por el motor de reservas y consume. Confundir los dos casos es cómo se
 * regalan o se cobran sesiones sin querer.
 */
function EpSlotSheet({
  agenda,
  date,
  startTime: prefill,
  onClose,
}: {
  agenda: StaffAgendaResponse;
  date: string;
  startTime: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const createSlot = useCreateEpSlot();
  const [startTime, setStartTime] = useState(prefill);
  const [durationMin, setDurationMin] = useState(60);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!agenda.centerId) return setError("No hay centro seleccionado.");
    try {
      await createSlot.mutateAsync({
        centerId: agenda.centerId,
        date,
        startTime,
        durationMin,
        memberId,
      });
      toast.show(memberId ? "Sesión personal agendada." : "Hueco publicado: ya se puede reservar.", "good");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo publicar el hueco.");
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      kicker={`HUECO LIBRE · ${formatLongDate(date)}`}
      title="Publicar hueco de EP"
      footer={
        <View style={{ gap: 8 }}>
          {error ? <Text style={[typo.rowMeta, { color: theme.critical }]}>{error}</Text> : null}
          <Button
            title={memberId ? "Agendar sesión" : "Publicar hueco"}
            variant="gold"
            size="lg"
            loading={createSlot.isPending}
            onPress={submit}
          />
        </View>
      }
    >
      <View style={styles.timeRow}>
        <View style={{ flex: 1 }}>
          <Field
            label="Inicio"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="09:00"
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <Stepper label="Minutos" value={durationMin} min={30} max={120} onChange={(v) => setDurationMin(v)} />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[typo.label, { color: theme.textSecondary }]}>Cliente</Text>
        <ChipRow>
          <Chip label="Dejar libre" selected={memberId === null} onPress={() => setMemberId(null)} />
          {agenda.members.slice(0, 30).map((member) => (
            <Chip
              key={member.id}
              label={`${member.firstName} ${member.lastName}`}
              tone="bone"
              selected={memberId === member.id}
              onPress={() => setMemberId((current) => (current === member.id ? null : member.id))}
            />
          ))}
        </ChipRow>
      </View>

      <View style={[styles.overlap, { backgroundColor: memberId ? theme.warningBg : theme.goldBg }]}>
        <View style={[styles.overlapDot, { backgroundColor: memberId ? theme.warning : theme.gold }]} />
        <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1, lineHeight: 17 }]}>
          {memberId
            ? "Con cliente asignado la sesión queda cerrada y no se ofrece a nadie más. Al agendarla tú, se crea sin bono asociado: no le descuenta sesión."
            : "Sin cliente asignado, la sesión queda libre y la reserva el socio desde su app. Ese hueco se crea sin bono asociado: no le descuenta sesión."}
        </Text>
      </View>
    </Sheet>
  );
}

const ATTENDEE_STATUS_LABEL: Record<StaffSessionAttendee["status"], string> = {
  BOOKED: "Reservado",
  WAITLISTED: "Lista de espera",
  ATTENDED: "Asistió",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelado",
};

/**
 * Asistentes de un grupo reducido.
 *
 * Lo que cambia respecto a la versión anterior no es el aspecto: es que quitar
 * a alguien deja de ser un `Alert` genérico. Sacar a un socio de una sesión
 * TIENE efecto sobre su bono, y ese efecto depende de cuánto falte —la ventana
 * de 24 h del descarte del entrenador, distinta de las 12 h que tiene el propio
 * socio para cancelar—, así que se abre una hoja que dice el efecto exacto
 * ANTES de confirmar. Descubrir que has consumido la sesión de alguien después
 * de haberla consumido no es una opción.
 */
function AttendeesSheet({
  session,
  date,
  onClose,
  onEdit,
}: {
  session: StaffSession;
  date: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading, isError } = useStaffSessionAttendees(session.id, date);
  const addBooking = useAddStaffBooking(session.id);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [discarding, setDiscarding] = useState<StaffSessionAttendee | null>(null);

  const booked = data?.attendees.filter((a) => a.status !== "WAITLISTED" && a.status !== "CANCELLED") ?? [];
  const waitlisted = data?.attendees.filter((a) => a.status === "WAITLISTED") ?? [];
  const capacity = data?.capacity ?? session.capacity;
  const free = Math.max(0, capacity - booked.length);
  const full = free === 0;

  const q = search.trim().toLowerCase();
  const candidates = (data?.bookableMembers ?? []).filter(
    (m) => !q || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
  );

  async function handleAdd(memberId: string, name: string) {
    try {
      await addBooking.mutateAsync({ memberId, occurrenceDate: date });
      toast.show(`Plaza reservada para ${name}.`, "good");
      setSearch("");
      setAdding(false);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo reservar la plaza.", "critical");
    }
  }

  return (
    <>
      <Sheet visible={!discarding && !adding} onClose={onClose} kicker="GRUPO REDUCIDO" title={session.name}>
        <View style={styles.attendeesHeaderRow}>
          <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>
            {booked.length} de {capacity} plazas · {free} {free === 1 ? "libre" : "libres"}
            {waitlisted.length > 0 ? ` · ${waitlisted.length} en lista de espera` : ""}
          </Text>
          <Button title="Añadir" variant="gold" size="sm" onPress={() => setAdding(true)} />
        </View>

        {isLoading ? (
          <SkeletonList rows={3} shape="avatarRow" />
        ) : isError || !data ? (
          <EmptyState icon="alert" title="No se pudieron cargar los asistentes" />
        ) : (
          <>
            <Text style={[typo.label, { color: theme.textSecondary }]}>Confirmados</Text>
            {booked.length === 0 ? (
              <EmptyState icon="users" title="Sin reservas" description="Todavía no hay ningún socio apuntado." />
            ) : (
              <View style={{ gap: 8 }}>
                {booked.map((a) => (
                  <View key={a.bookingId} style={[styles.attendeeRow, { borderColor: theme.border }]}>
                    <Avatar name={a.name} size={34} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>{ATTENDEE_STATUS_LABEL[a.status]}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Descartar a ${a.name}`}
                      onPress={() => setDiscarding(a)}
                      style={[styles.iconButton, { borderColor: theme.border }]}
                    >
                      <Icon name="close" size={16} color={theme.critical} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {waitlisted.length > 0 ? (
              <>
                <Text style={[typo.label, { color: theme.textSecondary }]}>Lista de espera</Text>
                {/* La regla, explícita: la plaza no se asigna sola. Con la
                    sesión completa hay que cancelar antes una reserva, y quien
                    espera no se entera si esto no se dice aquí. */}
                <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
                  La plaza no se asigna sola: con la sesión completa hay que cancelar antes una reserva.
                </Text>
                <View style={{ gap: 8 }}>
                  {waitlisted.map((a) => (
                    <View key={a.bookingId} style={[styles.attendeeRow, { borderColor: theme.border }]}>
                      <Avatar name={a.name} size={34} />
                      <Text style={[typo.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Button
                        title="Dar plaza"
                        variant="outline"
                        size="sm"
                        disabled={full}
                        loading={addBooking.isPending}
                        onPress={() => handleAdd(a.memberId, a.name)}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Button title="Editar sesión" variant="outline" onPress={onEdit} />
          </>
        )}
      </Sheet>

      {/* Hoja de añadir: al 82 % de alto, con el saldo del bono EN LA PROPIA
          FILA. Sin el saldo delante, apuntar a alguien es apostar a que le
          quedan sesiones. */}
      <Sheet visible={adding} onClose={() => setAdding(false)} kicker="AÑADIR ASISTENTE" title="¿A quién apuntas?">
        {full ? (
          <View style={[styles.overlap, { backgroundColor: theme.criticalBg }]}>
            <View style={[styles.overlapDot, { backgroundColor: theme.critical }]} />
            <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>
              La sesión está completa: para dar una plaza, cancela antes una reserva.
            </Text>
          </View>
        ) : null}

        <Field
          placeholder="Buscar socio…"
          value={search}
          onChangeText={setSearch}
          right={<Icon name="search" size={16} color={theme.textFaint} />}
        />

        {candidates.length === 0 ? (
          <Text style={[typo.rowMeta, { color: theme.textFaint }]}>
            Sin socios con bono vivo que coincidan. Solo aparecen socios con bono de grupos.
          </Text>
        ) : (
          <View style={{ gap: 6 }}>
            {candidates.slice(0, 20).map((m) => {
              const name = `${m.firstName} ${m.lastName}`;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  disabled={addBooking.isPending || full}
                  onPress={() => handleAdd(m.id, name)}
                  style={[styles.attendeeRow, { borderColor: theme.border, opacity: full ? 0.5 : 1 }]}
                >
                  <Avatar name={name} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>
                      {m.waiting ? "En lista de espera" : "Bono de grupos vivo"}
                    </Text>
                  </View>
                  <Icon name="plus" size={16} color={theme.goldText} />
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={[styles.overlap, { backgroundColor: theme.goodBg }]}>
          <View style={[styles.overlapDot, { backgroundColor: theme.good }]} />
          <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1, lineHeight: 17 }]}>
            Se consumirá 1 sesión de su bono de grupos y la sesión pasa a {Math.min(capacity, booked.length + 1)} de{" "}
            {capacity}. Solo aparecen socios con bono vivo.
          </Text>
        </View>
      </Sheet>

      {discarding ? (
        <DiscardSheet
          sessionId={session.id}
          attendee={discarding}
          onClose={() => setDiscarding(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Descartar a un asistente, con la regla de negocio delante.
 *
 * El servidor calcula el efecto (`GET .../discard`) y aquí solo se pinta: a más
 * de 24 h la sesión vuelve al bono; dentro de las 24 h se consume igualmente,
 * porque la plaza ya no se puede revender. El override —«devolver de todos
 * modos»— solo existe para quien puede ajustar saldo a mano
 * (`canAdjustSessionBalance`), y queda en `AuditLog`.
 *
 * Se dice explícitamente que esta ventana NO es la del socio (12 h): son dos
 * reglas distintas y confundirlas es la causa de la mitad de las discusiones de
 * mostrador.
 */
function DiscardSheet({
  sessionId,
  attendee,
  onClose,
}: {
  sessionId: string;
  attendee: StaffSessionAttendee;
  onClose: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const { data: preview, isLoading } = useDiscardPreview(sessionId, attendee.bookingId);
  const discard = useDiscardAttendee(sessionId);
  const [reason, setReason] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [forceRefund, setForceRefund] = useState(false);
  const [notifyMember, setNotifyMember] = useState(true);

  const within = preview?.withinWindow ?? false;
  const refunds = preview ? (within ? forceRefund && preview.canForceRefund : preview.refundsByDefault) : false;

  async function submit() {
    try {
      const result = await discard.mutateAsync({
        bookingId: attendee.bookingId,
        reason: [reason, freeText.trim() || null].filter(Boolean).join(" · ") || null,
        forceRefund,
        notifyMember,
      });
      toast.show(
        result.refunded ? `${attendee.name} fuera: sesión devuelta al bono.` : `${attendee.name} fuera: la sesión se consume.`,
        result.refunded ? "good" : "neutral"
      );
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo descartar.", "critical");
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      kicker="DESCARTAR ASISTENTE"
      title={attendee.name}
      footer={
        <Button
          title={refunds ? "Descartar y devolver sesión" : "Descartar asistente"}
          variant="danger"
          size="lg"
          loading={discard.isPending}
          disabled={isLoading}
          onPress={submit}
        />
      }
    >
      {isLoading || !preview ? (
        <SkeletonList rows={2} shape="card" />
      ) : (
        <>
          <View
            style={[
              styles.overlap,
              { backgroundColor: within && !refunds ? theme.criticalBg : theme.goodBg },
            ]}
          >
            <View style={[styles.overlapDot, { backgroundColor: within && !refunds ? theme.critical : theme.good }]} />
            <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1, lineHeight: 17 }]}>
              {preview.notice}
            </Text>
          </View>

          <Text style={[typo.label, { color: theme.textSecondary }]}>Motivo (opcional)</Text>
          <ChipRow>
            {["Lesión", "Cambio de día", "Aforo", "Otro"].map((option) => (
              <Chip
                key={option}
                label={option}
                selected={reason === option}
                onPress={() => setReason((current) => (current === option ? null : option))}
              />
            ))}
          </ChipRow>
          <Field placeholder="Detalle para el socio (opcional)" value={freeText} onChangeText={setFreeText} multiline />

          {/* El efecto exacto sobre las dos cifras que importan: su bono y las
              plazas de la sesión. */}
          <Card tone="alt" style={{ gap: 8 }}>
            <View style={styles.effectRow}>
              <Text style={[typo.rowMeta, { color: theme.textMuted, flex: 1 }]}>
                Bono{preview.planName ? ` · ${preview.planName}` : ""}
              </Text>
              <Text
                style={[
                  typo.num,
                  { color: refunds ? theme.good : theme.textSecondary },
                ]}
              >
                {preview.balanceBefore == null
                  ? "ilimitado"
                  : refunds
                    ? `${preview.balanceBefore} → ${preview.balanceAfterIfRefunded}`
                    : `${preview.balanceBefore} (sin cambio)`}
              </Text>
            </View>
            <View style={styles.effectRow}>
              <Text style={[typo.rowMeta, { color: theme.textMuted, flex: 1 }]}>Empieza en</Text>
              <Text style={[typo.num, { color: theme.text }]}>
                {formatCompact(Math.max(0, preview.hoursUntil * 3600))}
              </Text>
            </View>
          </Card>

          {within && preview.canForceRefund ? (
            <View style={[styles.overrideBox, { borderColor: theme.gold }]}>
              <View style={styles.overrideHeader}>
                <Text style={[typo.rowTitleSmall, { color: theme.text, flex: 1 }]}>Devolver la sesión de todos modos</Text>
                <Badge label="Admin" tone="gold" />
              </View>
              <ToggleRow
                label="Ajustar el saldo a mano"
                description="Queda registrado en el histórico de auditoría."
                value={forceRefund}
                onValueChange={setForceRefund}
              />
            </View>
          ) : null}

          <ToggleRow
            label="Avisar al socio"
            description="Le llega el motivo y qué pasa con su sesión."
            value={notifyMember}
            onValueChange={setNotifyMember}
          />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  navButton: { width: 34, height: 34, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  todayButton: { height: 34, paddingHorizontal: 12, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  timelineCard: { overflow: "hidden" },
  hoursColumn: { width: 38 },
  hourCell: { height: HOUR_HEIGHT, alignItems: "center", paddingTop: 4 },
  hourLabel: { fontFamily: fonts.semibold, fontSize: 10.5, ...tabular },
  hourSlot: { height: HOUR_HEIGHT, borderTopWidth: 1, padding: 4 },
  freeSlot: { flex: 1, borderRadius: radii.chip, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  event: { position: "absolute", left: 4, right: 8, borderRadius: 11, borderWidth: 1, overflow: "hidden", flexDirection: "row" },
  eventBar: { width: 3 },
  eventBody: { flex: 1, padding: 8, gap: 2, justifyContent: "center" },
  eventTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eventTitle: { fontFamily: fonts.semibold, fontSize: 12, flexShrink: 1 },
  eventMeta: { fontFamily: fonts.regular, fontSize: 10.5 },
  nowLine: { position: "absolute", left: 0, right: 0, height: 2, justifyContent: "center" },
  nowChip: { position: "absolute", right: 4, top: -9, borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2 },
  nowChipText: { fontFamily: fonts.bold, fontSize: 9, color: "#1D1D1C", fontVariant: ["tabular-nums"] },
  fab: { position: "absolute", right: layout.screenPadding, bottom: layout.tabBarHeight + 26 },
  timeRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  overlap: { flexDirection: "row", gap: 9, borderRadius: radii.control, padding: 12, alignItems: "flex-start" },
  overlapDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  attendeesHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  attendeeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconButton: { width: 34, height: 34, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  publishCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  effectRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  overrideBox: { borderWidth: 1, borderRadius: radii.control, padding: 13, gap: 6 },
  overrideHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
});
