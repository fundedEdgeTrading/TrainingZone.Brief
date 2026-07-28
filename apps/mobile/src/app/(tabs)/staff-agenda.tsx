import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Switch, Text, View, StyleSheet } from "react-native";
import { useStaffAgenda, useCreateStaffSession, useDeleteStaffSession } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { formatDayLabel } from "@/utils/format";
import type { StaffSession } from "@/api/types";

function addDaysToIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffAgendaScreen() {
  const theme = useTheme();
  const [date, setDate] = useState(todayIso());
  const { data, isLoading, isError, refetch, isRefetching } = useStaffAgenda(date);
  const createSession = useCreateStaffSession();
  const deleteSession = useDeleteStaffSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const dayLabel = useMemo(() => formatDayLabel(`${date}T00:00:00`), [date]);

  async function handleDelete(sessionId: string) {
    setFeedback(null);
    try {
      await deleteSession.mutateAsync(sessionId);
      setFeedback("Sesión eliminada.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <FadeInUp>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>AGENDA</Text>
        <Text style={[styles.title, { color: theme.text }]}>{dayLabel}</Text>
      </FadeInUp>

      <View style={styles.dayNav}>
        <Button title="‹ Anterior" variant="secondary" onPress={() => setDate((d) => addDaysToIso(d, -1))} />
        <Button title="Hoy" variant="secondary" onPress={() => setDate(todayIso())} />
        <Button title="Siguiente ›" variant="secondary" onPress={() => setDate((d) => addDaysToIso(d, 1))} />
      </View>

      {feedback ? (
        <Card style={{ paddingVertical: 10 }}>
          <Text style={{ color: theme.text, fontFamily: "Poppins_500Medium", fontSize: 13 }}>{feedback}</Text>
        </Card>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar la agenda" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {data.canEdit ? (
            <Button title="+ Nueva sesión" onPress={() => setModalOpen(true)} />
          ) : null}

          {data.sessions.length === 0 ? (
            <EmptyState title="Sin sesiones" description="No hay sesiones programadas ese día." />
          ) : (
            data.sessions.map((s) => (
              <SessionRow key={s.id} session={s} canEdit={data.canEdit} onDelete={() => handleDelete(s.id)} busy={deleteSession.isPending} />
            ))
          )}

          {data.canEdit ? (
            <CreateSessionModal
              visible={modalOpen}
              onClose={() => setModalOpen(false)}
              date={date}
              trainers={data.trainers}
              members={data.members}
              centerId={data.centerId}
              onCreated={() => {
                setModalOpen(false);
                setFeedback("Sesión creada.");
              }}
              createSession={createSession}
            />
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

function SessionRow({
  session,
  canEdit,
  onDelete,
  busy,
}: {
  session: StaffSession;
  canEdit: boolean;
  onDelete: () => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const active = session.bookings.filter((b) => b.status !== "CANCELLED");
  return (
    <Card>
      <View style={styles.sessionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sessionName, { color: theme.text }]}>{session.name}</Text>
          <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>
            {session.startTime}–{session.endTime} · {session.trainerName ?? "Sin entrenador"}
          </Text>
        </View>
        <Badge label={session.classType} tone="neutral" />
      </View>
      <View style={styles.sessionFooter}>
        <Text style={[styles.capacity, { color: theme.textMuted }]}>
          {active.length}/{session.capacity} plazas
          {session.recurrence !== "NONE" ? " · recurrente" : ""}
        </Text>
        {canEdit ? <Button title="Eliminar" variant="danger" onPress={onDelete} loading={busy} /> : null}
      </View>
    </Card>
  );
}

function CreateSessionModal({
  visible,
  onClose,
  date,
  trainers,
  members,
  centerId,
  onCreated,
  createSession,
}: {
  visible: boolean;
  onClose: () => void;
  date: string;
  trainers: { id: string; name: string }[];
  members: { id: string; firstName: string; lastName: string }[];
  centerId: string | null;
  onCreated: () => void;
  createSession: ReturnType<typeof useCreateStaffSession>;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"personal" | "reduced">("personal");
  const [trainerId, setTrainerId] = useState(trainers[0]?.id ?? "");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [isTrial, setIsTrial] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!centerId || !trainerId || !title.trim()) {
      setError("Falta el título o el entrenador.");
      return;
    }
    try {
      await createSession.mutateAsync({
        centerId,
        trainerId,
        title: title.trim(),
        type,
        date,
        startTime,
        endTime,
        memberId,
        isTrial,
        recurrence: "NONE",
        recUntil: null,
      });
      setTitle("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la sesión.");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Nueva sesión · {date}</Text>

            <Field label="Título" value={title} onChangeText={setTitle} placeholder="Personal Training" />

            <View style={styles.typeRow}>
              <Button title="Personal" variant={type === "personal" ? "primary" : "secondary"} onPress={() => setType("personal")} />
              <Button title="Grupo reducido" variant={type === "reduced" ? "primary" : "secondary"} onPress={() => setType("reduced")} />
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Entrenador</Text>
            <View style={styles.chipRow}>
              {trainers.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => setTrainerId(t.id)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: trainerId === t.id ? theme.ink : "transparent" }]}
                >
                  <Text style={{ color: trainerId === t.id ? theme.inkText : theme.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {type === "personal" ? (
              <>
                <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Cliente (opcional)</Text>
                <View style={styles.chipRow}>
                  {members.slice(0, 20).map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setMemberId(memberId === m.id ? null : m.id)}
                      style={[styles.chip, { borderColor: theme.border, backgroundColor: memberId === m.id ? theme.ink : "transparent" }]}
                    >
                      <Text style={{ color: memberId === m.id ? theme.inkText : theme.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                        {m.firstName} {m.lastName}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Field label="Hora inicio" value={startTime} onChangeText={setStartTime} placeholder="09:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Hora fin" value={endTime} onChangeText={setEndTime} placeholder="10:00" />
              </View>
            </View>

            <View style={styles.trialRow}>
              <Text style={{ color: theme.text, fontFamily: "Poppins_500Medium", fontSize: 13 }}>Clase de prueba</Text>
              <Switch value={isTrial} onValueChange={setIsTrial} />
            </View>

            {error ? <Text style={{ color: theme.critical, fontFamily: "Poppins_500Medium", fontSize: 13 }}>{error}</Text> : null}

            <Button title="Crear sesión" onPress={handleSubmit} loading={createSession.isPending} />
            <Button title="Cancelar" variant="secondary" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 22, marginTop: 4 },
  dayNav: { flexDirection: "row", gap: 8 },
  sessionHeader: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  sessionName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  sessionMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  sessionFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  capacity: { fontFamily: "Poppins_500Medium", fontSize: 12 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { maxHeight: "88%", borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  typeRow: { flexDirection: "row", gap: 8 },
  fieldLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  timeRow: { flexDirection: "row", gap: 10 },
  trialRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
});
