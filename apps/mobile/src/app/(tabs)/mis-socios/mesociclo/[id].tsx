import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApproveMesocycle, useMesocycleDetail } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Chip, ChipRow } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { MesocycleDay, MesocyclePhase } from "@/api/types";

/**
 * Mesociclo: borrador por aprobar y entreno del día.
 *
 * El orden de la pantalla es deliberado y no es el del documento: primero
 * **No se puede programar** (los `safetyCriteria` heredados del screening) y
 * después el objetivo. Quien va a firmar un plan tiene que leer los límites
 * ANTES que la propuesta; al revés, se aprueba el plan y los límites se leen
 * cuando ya da igual.
 *
 * Aquí se APRUEBA y se consulta. Editar día a día sigue siendo de la web: el
 * editor completo no cabe en 390 px sin volverse peor en ambos sitios.
 */
export default function MesocycleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading, isError, refetch, isRefetching } = useMesocycleDetail(id);
  const approve = useApproveMesocycle();
  const [dayKey, setDayKey] = useState<string | null>(null);

  const days = useMemo(
    () => (data?.phases ?? []).flatMap((phase) => phase.days.map((day) => ({ phase, day }))),
    [data]
  );
  const selected = days.find((entry) => entry.day.id === dayKey) ?? days[0] ?? null;

  async function handleApprove() {
    try {
      await approve.mutateAsync(id);
      toast.show("Mesociclo aprobado. Ya es el plan del socio.");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo aprobar.", "critical");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            style={[styles.iconButton, { borderColor: theme.border }]}
          >
            <Icon name="chevron-left" size={17} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[typo.kicker, { color: theme.textMuted }]}>MESOCICLO</Text>
            <Text style={[typo.screenTitleTight, { color: theme.text }]} numberOfLines={2}>
              {data?.title ?? "Plan"}
            </Text>
          </View>
          {data ? (
            <Badge
              label={data.status === "DRAFT" ? "Borrador" : data.status === "APPROVED" ? "Aprobado" : "Archivado"}
              tone={data.status === "DRAFT" ? "warning" : data.status === "APPROVED" ? "good" : "neutral"}
            />
          ) : null}
        </View>
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={4} shape="card" note="Cargando el plan…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar el mesociclo" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {/* Los límites, antes que la propuesta. */}
          {data.safetyCriteria.length > 0 ? (
            <FadeInUp delay={stagger(1)}>
              <Card padding={0} style={styles.safetyCard}>
                <View style={[styles.safetyBar, { backgroundColor: theme.critical }]} />
                <View style={styles.safetyBody}>
                  <Text style={[typo.label, { color: theme.critical }]}>No se puede programar</Text>
                  {data.safetyCriteria.map((item, index) => (
                    <View key={index} style={styles.bulletRow}>
                      <View style={[styles.bullet, { backgroundColor: theme.critical }]} />
                      <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>{item}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            </FadeInUp>
          ) : null}

          <FadeInUp delay={stagger(2)}>
            <Card style={{ gap: 8 }}>
              <Text style={[typo.label, { color: theme.textMuted }]}>Objetivo</Text>
              <Text style={[typo.body, { color: theme.text, lineHeight: 19 }]}>{data.objective}</Text>
            </Card>
          </FadeInUp>

          {data.weeklyLayout.length > 0 ? (
            <>
              <SectionTitle label="Reparto semanal" />
              <ChipRow>
                {data.weeklyLayout.map((item, index) => (
                  <Chip key={`${item}-${index}`} label={item} tone="neutral" />
                ))}
              </ChipRow>
            </>
          ) : null}

          {data.milestones.length > 0 ? (
            <>
              <SectionTitle label="Hitos" />
              <FadeInUp delay={stagger(3)}>
                <Card style={{ gap: 10 }}>
                  {data.milestones.map((milestone, index) => (
                    <View key={index} style={styles.milestoneRow}>
                      <Text style={[styles.week, { color: theme.gold }]}>{milestone.week ? `S${milestone.week}` : "–"}</Text>
                      <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>{milestone.text}</Text>
                    </View>
                  ))}
                </Card>
              </FadeInUp>
            </>
          ) : null}

          <SectionTitle label="Fases" />
          {data.phases.map((phase) => (
            <PhaseCard key={phase.id} phase={phase} />
          ))}

          {selected ? (
            <>
              <SectionTitle label="Entreno del día" />
              <ChipRow>
                {days.map(({ day }) => (
                  <Chip
                    key={day.id}
                    label={`${day.label} · ${day.venue}`}
                    selected={day.id === selected.day.id}
                    onPress={() => setDayKey(day.id)}
                  />
                ))}
              </ChipRow>
              <DayDetail day={selected.day} phase={selected.phase} />
            </>
          ) : null}

          {data.status === "DRAFT" ? (
            <View style={styles.footer}>
              <Button title="Aprobar" variant="gold" style={{ flex: 1 }} loading={approve.isPending} onPress={handleApprove} />
              {/* Pedir cambios se hace en la web, donde está el refinado con IA
                  y el editor: aquí solo se firma o se deja como está. */}
              <Button
                title="Pedir cambios"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => toast.show("Los cambios del plan se piden desde la web, con el editor delante.")}
              />
            </View>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

function PhaseCard({ phase }: { phase: MesocyclePhase }) {
  const theme = useTheme();
  return (
    <Card style={styles.phaseCard}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {phase.name}
        </Text>
        <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
          Semanas {phase.weekFrom}–{phase.weekTo} · {phase.days.length} {phase.days.length === 1 ? "día" : "días"}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={theme.textFaint} />
    </Card>
  );
}

function DayDetail({ day, phase }: { day: MesocycleDay; phase: MesocyclePhase }) {
  const theme = useTheme();
  return (
    <>
      <Card style={{ gap: 10 }}>
        <Text style={[typo.legend, { color: theme.textMuted }]}>
          {phase.name} · sem {phase.weekFrom}–{phase.weekTo}
        </Text>
        <Text style={[typo.cardTitle, { color: theme.text }]}>
          {day.label} · {day.venue}
        </Text>
        <Text style={[typo.label, { color: theme.goldText }]}>Foco</Text>
        <Text style={[typo.body, { color: theme.textSecondary }]}>{day.focus}</Text>

        {day.warmup.length > 0 ? (
          <>
            <Text style={[typo.label, { color: theme.textMuted, marginTop: 4 }]}>Calentamiento</Text>
            {day.warmup.map((item, index) => (
              <View key={index} style={styles.bulletRow}>
                <View style={[styles.bullet, { backgroundColor: theme.textFaint }]} />
                <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>{item}</Text>
              </View>
            ))}
          </>
        ) : null}
      </Card>

      {day.blocks.map((block) => (
        <Card key={block.id} style={{ gap: 12 }}>
          <View style={styles.blockHeader}>
            <Text style={[typo.cardTitleSmall, { color: theme.text, flex: 1 }]} numberOfLines={1}>
              {block.name}
            </Text>
            <Badge label={`${block.durationMin} min`} tone="outline" />
          </View>

          {block.exercises.map((exercise) => (
            <View key={exercise.id} style={{ gap: 6 }}>
              <View style={styles.exerciseHeader}>
                <Text style={[typo.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                  {exercise.name}
                </Text>
                <Text style={[styles.setsReps, { color: theme.goldText }]}>
                  {exercise.sets} × {exercise.reps}
                </Text>
              </View>
              {exercise.load ? <Badge label={exercise.load} tone="neutral" /> : null}
              <Text style={[typo.rowMeta, { color: theme.textSecondary }]}>{exercise.description}</Text>
              {/* El «porqué» es lo que separa el mesociclo de una plantilla de
                  Excel: no se omite ni se pliega detrás de un desplegable. */}
              <View style={[styles.rationale, { backgroundColor: theme.sheet }]}>
                <Icon name="alert" size={13} color={theme.goldText} />
                <Text style={[typo.rowMetaSmall, { color: theme.textMuted, flex: 1, lineHeight: 16 }]}>
                  {exercise.rationale}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  safetyCard: { flexDirection: "row", overflow: "hidden" },
  safetyBar: { width: 3 },
  safetyBody: { flex: 1, padding: 16, gap: 8 },
  bulletRow: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 6 },
  milestoneRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  week: { fontFamily: fonts.bold, fontSize: 12.5, width: 30, ...tabular },
  phaseCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  exerciseHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  setsReps: { fontFamily: fonts.bold, fontSize: 13.5, ...tabular },
  rationale: { flexDirection: "row", gap: 8, borderRadius: radii.control, padding: 10 },
  footer: { flexDirection: "row", gap: 8, marginTop: 6 },
});
