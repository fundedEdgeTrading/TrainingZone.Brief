import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSessionFeedback, useSaveSessionFeedback } from "@/api/queries";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { duration, easeOutSoft, useReducedMotion } from "@/theme/motion";
import { ScreenFrame } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { ScoreBar } from "@/components/ScoreBar";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { formatDayLabel } from "@/utils/format";
import type { FeedbackAxis, FeedbackScores } from "@/api/types";

// C4 del handoff: feedback 1-10 por socio, uno por pantalla, con autoguardado
// por eje y confirmación al pasar al siguiente.
const AXES: { key: FeedbackAxis; label: string }[] = [
  { key: "rpe", label: "Esfuerzo percibido (RPE)" },
  { key: "technique", label: "Técnica de ejecución" },
  { key: "attitude", label: "Actitud y compromiso" },
  { key: "energy", label: "Energía" },
  { key: "mobility", label: "Movilidad" },
  { key: "pain", label: "Dolor o molestias" },
  { key: "adherence", label: "Adherencia al plan" },
  { key: "progress", label: "Progreso vs. sesión anterior" },
];

const EMPTY_SCORES: FeedbackScores = {
  rpe: null,
  technique: null,
  attitude: null,
  energy: null,
  mobility: null,
  pain: null,
  adherence: null,
  progress: null,
};

export default function SessionFeedbackScreen() {
  const theme = useTheme();
  const toast = useToast();
  const reduced = useReducedMotion();
  const { id, d } = useLocalSearchParams<{ id: string; d?: string }>();
  const { data, isLoading, isError } = useSessionFeedback(id, d);
  const saveFeedback = useSaveSessionFeedback(id);

  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, FeedbackScores>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const slide = useRef(new Animated.Value(0)).current;
  const autosave = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estado inicial: lo que ya hubiera guardado el entrenador.
  useEffect(() => {
    if (!data) return;
    setScores(Object.fromEntries(data.members.map((m) => [m.bookingId, { ...EMPTY_SCORES, ...m.scores }])));
    setNotes(Object.fromEntries(data.members.map((m) => [m.bookingId, m.note ?? ""])));
  }, [data]);

  useEffect(() => () => {
    if (autosave.current) clearTimeout(autosave.current);
  }, []);

  const members = data?.members ?? [];
  const current = members[index];
  const completed = useMemo(
    () => members.map((m) => AXES.every((axis) => scores[m.bookingId]?.[axis.key] != null)),
    [members, scores]
  );

  function setScore(bookingId: string, axis: FeedbackAxis, value: number) {
    setScores((prev) => ({ ...prev, [bookingId]: { ...(prev[bookingId] ?? EMPTY_SCORES), [axis]: value } }));

    // Autoguardado optimista: no bloquea la interacción y, si el entrenador
    // sale a mitad, lo puntuado ya está en el servidor.
    if (autosave.current) clearTimeout(autosave.current);
    autosave.current = setTimeout(() => {
      saveFeedback.mutate({ bookingId, scores: { [axis]: value }, note: notes[bookingId] ?? null });
    }, 700);
  }

  async function persist(bookingId: string) {
    await saveFeedback.mutateAsync({
      bookingId,
      scores: scores[bookingId] ?? EMPTY_SCORES,
      note: notes[bookingId]?.trim() ? notes[bookingId].trim() : null,
    });
  }

  function animateTo(next: number) {
    if (reduced) {
      setIndex(next);
      return;
    }
    Animated.timing(slide, { toValue: next > index ? -1 : 1, duration: duration.fast, easing: easeOutSoft, useNativeDriver: true }).start(
      () => {
        setIndex(next);
        slide.setValue(next > index ? 1 : -1);
        Animated.timing(slide, { toValue: 0, duration: duration.base, easing: easeOutSoft, useNativeDriver: true }).start();
      }
    );
  }

  async function saveAndAdvance() {
    if (!current) return;
    try {
      if (autosave.current) clearTimeout(autosave.current);
      await persist(current.bookingId);
      if (index < members.length - 1) {
        animateTo(index + 1);
        return;
      }
      toast.show("Feedback guardado. ¡Buen trabajo!", "good");
      router.back();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo guardar el feedback.", "critical");
    }
  }

  return (
    <ScreenFrame withTabBar>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          hitSlop={10}
          onPress={() => router.back()}
          style={[styles.iconButton, { borderColor: theme.border }]}
        >
          <Icon name="close" size={16} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[typo.kicker, { color: theme.textMuted }]} numberOfLines={1}>
            {data ? `${data.session.name.toUpperCase()} · ${formatDayLabel(`${data.session.occurrenceDate}T00:00:00`)}` : "FEEDBACK"}
          </Text>
          <Text style={[typo.cardTitleSmall, { color: theme.text }]}>
            {members.length > 0 ? `Socio ${index + 1} de ${members.length}` : "Feedback de la sesión"}
          </Text>
        </View>
      </View>

      {members.length > 0 ? (
        <View style={styles.progressRow}>
          {members.map((member, i) => (
            <View
              key={member.bookingId}
              style={[
                styles.progressSegment,
                { backgroundColor: completed[i] ? theme.gold : i === index ? theme.goldSoft : theme.surfaceAlt },
              ]}
            />
          ))}
        </View>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar la sesión" description="Vuelve a intentarlo desde tu panel." />
      ) : !current ? (
        <EmptyState icon="users" title="Sin asistentes" description="Nadie tenía reserva en esta sesión." />
      ) : (
        <>
          <Animated.View style={{ flex: 1, transform: [{ translateX: slide.interpolate({ inputRange: [-1, 1], outputRange: [-40, 40] }) }] }}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <Card style={{ gap: 10 }}>
                <View style={styles.memberRow}>
                  <Avatar name={current.name} size={46} />
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[typo.cardTitleSmall, { color: theme.text }]} numberOfLines={1}>
                      {current.name}
                    </Text>
                    <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={2}>
                      {current.attended ? "Asistió" : "Sin marcar"} · {current.monthlyCount + 1}ª sesión del mes
                      {current.planNames.length ? ` · ${current.planNames[0]}` : ""}
                    </Text>
                  </View>
                  {current.aptitude ? (
                    <Badge
                      label={current.aptitude.zone ?? "Adaptar"}
                      tone={current.aptitude.light === "RED" ? "critical" : "warning"}
                    />
                  ) : null}
                </View>
              </Card>

              <Card style={{ gap: 2 }}>
                {AXES.map((axis) => (
                  <ScoreBar
                    key={axis.key}
                    label={axis.label}
                    value={scores[current.bookingId]?.[axis.key] ?? null}
                    onChange={(value) => setScore(current.bookingId, axis.key, value)}
                  />
                ))}
              </Card>

              <Field
                label="Nota para su ficha"
                placeholder="Opcional: lo que quieras dejar registrado"
                multiline
                value={notes[current.bookingId] ?? ""}
                onChangeText={(text) => setNotes((prev) => ({ ...prev, [current.bookingId]: text }))}
              />

              <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>
                Se guarda solo según puntúas. Guardar marca la asistencia del socio.
              </Text>
            </ScrollView>
          </Animated.View>

          <View style={styles.footer}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Socio anterior"
              disabled={index === 0}
              onPress={() => animateTo(index - 1)}
              style={[styles.iconButton, { borderColor: theme.border, opacity: index === 0 ? 0.4 : 1 }]}
            >
              <Icon name="chevron-left" size={16} color={theme.text} />
            </Pressable>
            <Button
              title={index === members.length - 1 ? "Guardar y cerrar" : "Guardar y siguiente"}
              variant="gold"
              size="lg"
              style={{ flex: 1 }}
              loading={saveFeedback.isPending}
              onPress={saveAndAdvance}
            />
          </View>
        </>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  iconButton: { width: 44, height: 44, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  progressRow: { flexDirection: "row", gap: 4, marginBottom: 10 },
  progressSegment: { flex: 1, height: 4, borderRadius: 2 },
  content: { gap: layout.gap, paddingBottom: 20 },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  footer: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
});
