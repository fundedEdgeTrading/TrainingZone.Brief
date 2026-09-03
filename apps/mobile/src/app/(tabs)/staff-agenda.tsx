import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, PanResponder, Pressable, RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  useStaffAgenda,
  useSaveStaffSession,
  useDeleteStaffSession,
  useStaffSessionAttendees,
  useAddStaffBooking,
  useRemoveStaffBooking,
} from "@/api/queries";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Chip, ChipRow } from "@/components/Chip";
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
  const { data, isLoading, isError, refetch, isRefetching } = useStaffAgenda(date);
  const deleteSession = useDeleteStaffSession();
  const scrollRef = useRef<ScrollView | null>(null);

  const sessions = useMemo(
    () => (data?.sessions ?? []).filter((s) => (trainerId ? s.trainerId === trainerId : true)),
    [data, trainerId]
  );

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
          </View>
        </FadeInUp>

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
                        onPress={() => setEditing({ session: null, startTime: `${String(hour).padStart(2, "0")}:00` })}
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
          <EmptyState icon="calendar" title="Sin sesiones ese día" description="Toca un hueco libre para crear la primera." />
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

const ATTENDEE_STATUS_LABEL: Record<StaffSessionAttendee["status"], string> = {
  BOOKED: "Reservado",
  WAITLISTED: "Lista de espera",
  ATTENDED: "Asistió",
  NO_SHOW: "No-show",
  CANCELLED: "Cancelado",
};

/**
 * Asistentes de un grupo reducido: roster + lista de espera de la ocurrencia,
 * con alta y baja de socios sin salir de la agenda. Reutiliza `Sheet`, y las
 * mismas rutas de staff que la web (`bookSessionForMemberAsStaff` /
 * `cancelSessionBooking` vía la API móvil).
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
  const removeBooking = useRemoveStaffBooking(session.id);
  const [search, setSearch] = useState("");

  const booked = data?.attendees.filter((a) => a.status !== "WAITLISTED" && a.status !== "CANCELLED") ?? [];
  const waitlisted = data?.attendees.filter((a) => a.status === "WAITLISTED") ?? [];
  const capacity = data?.capacity ?? session.capacity;
  const full = booked.length >= capacity;

  const q = search.trim().toLowerCase();
  const candidates = (data?.bookableMembers ?? []).filter(
    (m) => !q || `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)
  );

  async function handleAdd(memberId: string, name: string) {
    try {
      await addBooking.mutateAsync({ memberId, occurrenceDate: date });
      toast.show(`Plaza reservada para ${name}.`, "good");
      setSearch("");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo reservar la plaza.", "critical");
    }
  }

  function handleRemove(attendee: StaffSessionAttendee) {
    Alert.alert("Quitar del roster", `Se cancelará la plaza de ${attendee.name}.`, [
      { text: "Volver", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: async () => {
          try {
            await removeBooking.mutateAsync(attendee.bookingId);
            toast.show(`Reserva de ${attendee.name} cancelada.`, "good");
          } catch (err) {
            toast.show(err instanceof Error ? err.message : "No se pudo cancelar.", "critical");
          }
        },
      },
    ]);
  }

  return (
    <Sheet visible onClose={onClose} kicker="GRUPO REDUCIDO" title={session.name}>
      <View style={styles.attendeesHeaderRow}>
        <Text style={[typo.rowMeta, { color: theme.textSecondary }]}>
          {session.startTime}–{session.endTime} · {booked.length}/{capacity} plazas
        </Text>
        <Button title="Editar sesión" variant="outline" size="sm" onPress={onEdit} />
      </View>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar los asistentes" />
      ) : (
        <>
          {booked.length === 0 ? (
            <EmptyState icon="users" title="Sin reservas" description="Todavía no hay ningún socio apuntado a esta sesión." />
          ) : (
            <View style={{ gap: 8 }}>
              {booked.map((a) => (
                <View key={a.bookingId} style={[styles.attendeeRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[typo.rowTitle, { color: theme.text }]}>{a.name}</Text>
                    <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>{ATTENDEE_STATUS_LABEL[a.status]}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar a ${a.name}`}
                    disabled={removeBooking.isPending}
                    onPress={() => handleRemove(a)}
                    style={[styles.iconButton, { borderColor: theme.border }]}
                  >
                    <Icon name="trash" size={16} color={theme.critical} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {waitlisted.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={[typo.label, { color: theme.textSecondary }]}>Lista de espera ({waitlisted.length})</Text>
              {waitlisted.map((a) => (
                <Text key={a.bookingId} style={[typo.rowMeta, { color: theme.textMuted }]}>
                  {a.name}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text style={[typo.label, { color: theme.textSecondary }]}>Añadir socio</Text>
            {full ? (
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                La sesión está completa: para dar una plaza, cancela antes una reserva.
              </Text>
            ) : (
              <>
                <Field
                  placeholder="Buscar socio…"
                  value={search}
                  onChangeText={setSearch}
                  right={<Icon name="search" size={16} color={theme.textFaint} />}
                />
                {q && candidates.length === 0 ? (
                  <Text style={[typo.rowMeta, { color: theme.textFaint }]}>Sin socios con bono que coincidan.</Text>
                ) : (
                  <View style={{ gap: 6 }}>
                    {candidates.slice(0, 20).map((m) => {
                      const name = `${m.firstName} ${m.lastName}`;
                      return (
                        <Pressable
                          key={m.id}
                          accessibilityRole="button"
                          disabled={addBooking.isPending}
                          onPress={() => handleAdd(m.id, name)}
                          style={[styles.attendeeRow, { borderColor: theme.border }]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[typo.rowTitle, { color: theme.text }]}>{name}</Text>
                            {m.waiting ? (
                              <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>En lista de espera</Text>
                            ) : null}
                          </View>
                          <Icon name="plus" size={16} color={theme.goldText} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
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
  iconButton: { width: 32, height: 32, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
