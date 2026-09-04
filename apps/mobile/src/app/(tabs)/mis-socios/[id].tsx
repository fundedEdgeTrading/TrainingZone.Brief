import { useState } from "react";
import { Linking, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import {
  useAddMemberNote,
  useGenerateMesocycle,
  useMesocycles,
  useTrainerMemberDetail,
} from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SectionTitle } from "@/components/ScreenHeader";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { KpiTile } from "@/components/KpiTile";
import { Segmented } from "@/components/Segmented";
import { Sheet } from "@/components/Sheet";
import { Stepper } from "@/components/Stepper";
import { ScoreReadout } from "@/components/ScoreBar";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { BrandLoader, MESOCYCLE_STEPS, EXPECTED_MS, usePacedLoader } from "@/components/BrandLoader";
import { formatDayMonth, formatShortDate } from "@/utils/format";
import type { TrainerMemberSession } from "@/api/types";

type Tab = "sesiones" | "plan" | "salud" | "notas";

const AXIS_LABEL: Record<string, string> = {
  rpe: "Esfuerzo",
  technique: "Técnica",
  attitude: "Actitud",
  energy: "Energía",
  mobility: "Movilidad",
  pain: "Dolor",
  adherence: "Adherencia",
  progress: "Progreso",
};

/**
 * Ficha del socio para el entrenador. Cuatro pestañas internas —Sesiones, Plan,
 * Salud y Notas— en vez de una pantalla larga: son cuatro consultas distintas,
 * y en la sala se abre una sola.
 *
 * «Plan» (mesociclos) solo aparece con `canManageMesocycles`. El socio NO ve su
 * mesociclo ni en la web ni aquí: sigue siendo una herramienta del entrenador.
 */
export default function TrainerMemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [tab, setTab] = useState<Tab>("sesiones");
  const [noting, setNoting] = useState(false);
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerMemberDetail(id);

  const canPlan = data?.canManageMesocycles ?? false;
  const tabs: { value: Tab; label: string }[] = [
    { value: "sesiones", label: "Sesiones" },
    ...(canPlan ? [{ value: "plan" as Tab, label: "Plan" }] : []),
    { value: "salud", label: "Salud" },
    { value: "notas", label: "Notas" },
  ];

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => goBack("/mis-socios")}
            style={[styles.iconButton, { borderColor: theme.border }]}
          >
            <Icon name="chevron-left" size={17} color={theme.text} />
          </Pressable>
          <Text style={[typo.screenTitleTight, { color: theme.text, flex: 1 }]} numberOfLines={1}>
            {data?.member.name ?? "Socio"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nueva nota"
            onPress={() => setNoting(true)}
            style={[styles.iconButton, { borderColor: theme.border }]}
          >
            <Icon name="clipboard" size={17} color={theme.text} />
          </Pressable>
        </View>
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={4} shape="row" note="Cargando la ficha…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar la ficha" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <HeroCard padding={17}>
            <View style={styles.heroRow}>
              <Avatar name={data.member.name} uri={data.member.photoUrl} size={56} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[typo.cardTitle, { color: theme.onInk.text }]} numberOfLines={1}>
                  {data.member.name}
                </Text>
                <Text style={[typo.rowMeta, { color: theme.onInk.secondary }]} numberOfLines={1}>
                  {[data.member.ageYears ? `${data.member.ageYears} años` : null, `socio desde ${formatDayMonth(data.member.joinedAt)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
                <View style={styles.badgeRow}>
                  {data.balances.map((balance) => (
                    <Badge
                      key={balance.subscriptionId}
                      label={
                        balance.unlimited
                          ? `${balance.serviceKind === "EP" ? "EP" : "Grupos"} ilimitado`
                          : `${balance.serviceKind === "EP" ? "EP" : "Grupos"} · ${balance.remaining ?? 0} de ${balance.total ?? 0}`
                      }
                      tone="gold"
                    />
                  ))}
                  {data.aptitude && data.aptitude.light !== "GREEN" ? (
                    <Badge
                      label={data.aptitude.light === "RED" ? "Rojo" : "Ámbar"}
                      tone={data.aptitude.light === "RED" ? "critical" : "warning"}
                    />
                  ) : null}
                </View>
              </View>
            </View>
            <View style={styles.heroActions}>
              <Button onInk title="Nueva nota" size="sm" style={{ flex: 1 }} onPress={() => setNoting(true)} />
              {data.member.phone ? (
                <Button
                  onInk
                  title="Llamar"
                  variant="outline"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => Linking.openURL(`tel:${data.member.phone?.replace(/\s+/g, "")}`)}
                />
              ) : null}
            </View>
          </HeroCard>

          {data.aptitude && data.aptitude.light !== "GREEN" ? (
            <FadeInUp delay={stagger(2)}>
              <Card style={{ borderColor: data.aptitude.light === "RED" ? theme.critical : theme.warning, gap: 8 }}>
                <Text style={[typo.label, { color: data.aptitude.light === "RED" ? theme.critical : theme.warning }]}>
                  Aptitud · {data.aptitude.light === "RED" ? "evitar" : "adaptar"}
                </Text>
                <Text style={[typo.rowTitleSmall, { color: theme.text }]}>
                  {data.aptitude.zone ?? "Zona sin especificar"} · {data.aptitude.condition}
                </Text>
                {data.aptitude.adaptation ? (
                  <Text style={[typo.rowMeta, { color: theme.textSecondary }]}>{data.aptitude.adaptation}</Text>
                ) : null}
              </Card>
            </FadeInUp>
          ) : null}

          <FadeInUp delay={stagger(3)} style={styles.kpiRow}>
            <KpiTile label="Adherencia" value={`${data.stats.adherencePct}%`} tone={data.stats.adherencePct >= 85 ? "good" : "warning"} small />
            <KpiTile label="Sesiones del mes" value={`${data.stats.sessionsThisMonth}`} small />
            <KpiTile label="RPE medio" value={data.stats.rpeAvg != null ? `${data.stats.rpeAvg}` : "–"} tone="gold" small />
          </FadeInUp>

          <FadeInUp delay={stagger(4)}>
            <Segmented value={tab} onChange={setTab} options={tabs} />
          </FadeInUp>

          {tab === "sesiones" ? <SessionsTab sessions={data.sessions} /> : null}
          {tab === "plan" && canPlan ? <PlanTab memberId={id} /> : null}
          {tab === "salud" ? (
            <Card style={{ gap: 8 }}>
              {data.aptitude ? (
                <>
                  <Text style={[typo.cardTitleSmall, { color: theme.text }]}>
                    {data.aptitude.zone ?? "Condición registrada"}
                  </Text>
                  <Text style={[typo.rowMeta, { color: theme.textSecondary }]}>{data.aptitude.condition}</Text>
                  {data.aptitude.adaptation ? (
                    <Text style={[typo.rowMeta, { color: theme.textMuted }]}>Adaptación: {data.aptitude.adaptation}</Text>
                  ) : null}
                </>
              ) : (
                <EmptyState icon="check" title="Sin condiciones abiertas" description="Nada que adaptar ahora mismo." />
              )}
            </Card>
          ) : null}
          {tab === "notas" ? (
            data.notes.length === 0 ? (
              <EmptyState icon="clipboard" title="Sin notas" description="Escribe la primera desde el botón de arriba." />
            ) : (
              data.notes.map((note) => (
                <Card key={note.id} style={{ gap: 6 }}>
                  <View style={styles.noteHeader}>
                    <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
                      {formatShortDate(note.createdAt)}
                      {note.authorName ? ` · ${note.authorName}` : ""}
                    </Text>
                    {note.important ? <Badge label="Destacada" tone="gold" /> : null}
                  </View>
                  <Text style={[typo.body, { color: theme.text }]}>{note.body}</Text>
                </Card>
              ))
            )
          ) : null}
        </>
      )}

      <NoteSheet memberId={id} visible={noting} onClose={() => setNoting(false)} />
    </ScreenContainer>
  );
}

function SessionsTab({ sessions }: { sessions: TrainerMemberSession[] }) {
  const theme = useTheme();
  if (sessions.length === 0) {
    return <EmptyState icon="clock" title="Sin sesiones contigo todavía" description="Aquí aparecen las que le has dado." />;
  }

  return (
    <>
      {sessions.map((session) => {
        const noShow = session.status === "NO_SHOW";
        const scored = session.scores
          ? Object.entries(session.scores).filter(([, value]) => value != null)
          : [];
        const date = new Date(`${session.day}T00:00:00`);

        return (
          <Card key={session.bookingId} style={[styles.sessionCard, noShow ? { opacity: 0.7 } : null]}>
            <View style={[styles.dateBlock, { backgroundColor: theme.surfaceAlt }]}>
              <Text style={[styles.dateWeekday, { color: theme.textMuted }]}>
                {date.toLocaleDateString("es-ES", { month: "short" }).slice(0, 3).toUpperCase()}
              </Text>
              <Text style={[styles.dateNumber, { color: noShow ? theme.critical : theme.text }]}>{date.getDate()}</Text>
            </View>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={[typo.rowTitle, { color: noShow ? theme.critical : theme.text }]} numberOfLines={1}>
                {session.sessionName}
              </Text>
              <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                {session.startTime}–{session.endTime}
                {noShow ? " · no se presentó" : session.status === "ATTENDED" ? " · asistió" : ""}
              </Text>
              {scored.length > 0 ? (
                <View style={styles.scoreGrid}>
                  {scored.slice(0, 4).map(([axis, value]) => (
                    <View key={axis} style={styles.scoreCell}>
                      <ScoreReadout label={AXIS_LABEL[axis] ?? axis} value={value as number} />
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}
    </>
  );
}

/**
 * Pestaña «Plan»: los mesociclos del socio y la generación del borrador.
 *
 * La generación es la única espera larga de la app (60-120 s con IA), así que
 * es la única que se lleva el velo de marca bloqueante. El aviso de privacidad
 * va arriba y no en letra pequeña: lo que sale hacia el modelo y lo que nunca
 * sale es información que el entrenador debe poder repetirle al socio.
 */
function PlanTab({ memberId }: { memberId: string }) {
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading } = useMesocycles(memberId);
  const generate = useGenerateMesocycle();
  const loader = usePacedLoader(MESOCYCLE_STEPS, EXPECTED_MS);

  const [level, setLevel] = useState("");
  const [weeks, setWeeks] = useState(8);
  const [availability, setAvailability] = useState("");

  async function submit() {
    loader.start();
    try {
      const result = await generate.mutateAsync({ memberId, level, weeks, availability });
      // Se navega DENTRO de `finish`: el velo sigue encima mientras la pantalla
      // del mesociclo se monta y arranca su entrada escalonada, y se disuelve
      // (240 ms) con el plan ya entrando debajo. Así no hay pantalla vacía
      // entre el check de «Mesociclo listo» y el plan.
      loader.finish(() => router.push(`/mis-socios/mesociclo/${result.mesocycleId}`));
    } catch (err) {
      loader.abort();
      toast.show(err instanceof Error ? err.message : "No se pudo generar el mesociclo.", "critical");
    }
  }

  return (
    <>
      <Card style={{ gap: 12 }}>
        <Text style={[typo.cardTitleSmall, { color: theme.text }]}>Generar un mesociclo</Text>
        <View style={[styles.privacy, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          <Icon name="alert" size={15} color={theme.goldText} />
          <Text style={[typo.rowMetaSmall, { color: theme.textSecondary, flex: 1, lineHeight: 16 }]}>
            Sale hacia la IA edad, sexo, objetivos, marcas y —con consentimiento— los criterios clínicos del screening.
            Nunca nombre, DNI, teléfono ni email.
          </Text>
        </View>

        <Field
          label="Nivel de partida"
          placeholder="Vacío = se toma de la valoración inicial"
          value={level}
          onChangeText={setLevel}
        />
        <Stepper label="Semanas" value={weeks} min={4} max={12} onChange={setWeeks} />
        <Field
          label="Disponibilidad"
          placeholder={"Lunes TZ\nMiércoles TZ\nSábado Gym"}
          value={availability}
          onChangeText={setAvailability}
          multiline
        />

        <Button
          title="Generar borrador"
          variant="gold"
          disabled={!data?.aiConfigured || !availability.trim()}
          onPress={submit}
        />
        {!data?.aiConfigured && !isLoading ? (
          <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
            La generación con IA no está configurada en este entorno.
          </Text>
        ) : null}
      </Card>

      <SectionTitle label="Sus mesociclos" />
      {isLoading ? (
        <SkeletonList rows={2} shape="row" note="Cargando sus planes…" />
      ) : (data?.mesocycles.length ?? 0) === 0 ? (
        <EmptyState icon="clipboard" title="Sin mesociclos" description="Genera el primer borrador arriba." />
      ) : (
        data!.mesocycles.map((meso) => (
          <Card key={meso.id} style={styles.mesoCard}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={2}>
                {meso.title}
              </Text>
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                {formatShortDate(meso.createdAt)}
                {meso.approvedAt ? ` · aprobado el ${formatShortDate(meso.approvedAt)}` : ""}
              </Text>
            </View>
            <Badge
              label={meso.status === "DRAFT" ? "Borrador" : meso.status === "APPROVED" ? "Aprobado" : "Archivado"}
              tone={meso.status === "DRAFT" ? "warning" : meso.status === "APPROVED" ? "good" : "neutral"}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${meso.title}`}
              hitSlop={8}
              onPress={() => router.push(`/mis-socios/mesociclo/${meso.id}`)}
            >
              <Icon name="chevron-right" size={16} color={theme.textFaint} />
            </Pressable>
          </Card>
        ))
      )}

      {loader.loading ? (
        <BrandLoader
          steps={MESOCYCLE_STEPS}
          step={loader.step}
          done={loader.done}
          exiting={loader.exiting}
          onNotifyMe={() => {
            // Salir NO cancela el trabajo: la petición sigue viva y el borrador
            // aparece en la lista al volver. En web esto no existe porque la
            // ventana se queda abierta; en el móvil, minuto y medio de velo es
            // minuto y medio con la app secuestrada.
            loader.abort();
            toast.show("Seguimos generando. Te avisamos cuando el borrador esté listo.");
          }}
        />
      ) : null}
    </>
  );
}

function NoteSheet({ memberId, visible, onClose }: { memberId: string; visible: boolean; onClose: () => void }) {
  const toast = useToast();
  const addNote = useAddMemberNote(memberId);
  const [body, setBody] = useState("");

  async function submit() {
    try {
      await addNote.mutateAsync(body);
      setBody("");
      toast.show("Nota guardada en su ficha.");
      onClose();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo guardar la nota.", "critical");
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} kicker="NUEVA NOTA" title="Para su ficha">
      <Field
        placeholder="Molestia en hombro izquierdo al presionar por encima de la cabeza…"
        value={body}
        onChangeText={setBody}
        multiline
      />
      <Button title="Guardar nota" variant="gold" disabled={!body.trim()} loading={addNote.isPending} onPress={submit} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  heroActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kpiRow: { flexDirection: "row", gap: 8 },
  sessionCard: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  dateBlock: { width: 42, height: 46, borderRadius: radii.chip, alignItems: "center", justifyContent: "center" },
  dateWeekday: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.8 },
  dateNumber: { fontFamily: fonts.bold, fontSize: 16, ...tabular },
  scoreGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  scoreCell: { flexBasis: "45%", flexGrow: 1 },
  noteHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  privacy: { flexDirection: "row", gap: 9, borderWidth: 1, borderRadius: radii.control, padding: 11 },
  mesoCard: { flexDirection: "row", alignItems: "center", gap: 11 },
});
