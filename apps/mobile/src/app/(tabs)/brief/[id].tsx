import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useBriefDetail, useSaveDebrief } from "@/api/queries";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { BriefCondition, BriefRosterEntry, DebriefFeeling } from "@/api/types";

const LIGHT_RANK: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

/**
 * Rótulo de una condición sin regla, SIN la descripción clínica (E3-05: el
 * entrenador lee adaptaciones, no diagnósticos). El servidor ya no la manda;
 * aquí solo se compone tipo + zona con lo que sí viaja en el roster.
 */
const HEALTH_TYPE_LABEL: Record<string, string> = {
  INJURY: "Lesión",
  CHRONIC_CONDITION: "Condición crónica",
  MEDICATION: "Medicación",
  SURGERY: "Cirugía",
  PREGNANCY: "Embarazo",
  ALLERGY: "Alergia",
};

function conditionLabel(condition: BriefCondition): string {
  const type = HEALTH_TYPE_LABEL[condition.type] ?? "Condición";
  if (!condition.zone) return type;
  const side = condition.side && condition.side !== "NO_APLICA" ? ` (${condition.side.toLowerCase()})` : "";
  return `${type} · ${condition.zone}${side}`;
}

/**
 * Session Brief: con quién estás a punto de entrenar, qué hay que adaptarle y
 * —al terminar— cómo ha ido con cada uno.
 *
 * El orden es lo que hace útil esta pantalla: PRIMERO quien requiere atención
 * (rojo, luego ámbar), y los socios sin restricción en una lista compacta al
 * final. Ordenado por nombre —como estaba— el rojo aparecía en la posición 5 de
 * 6 y se leía cuando la sesión ya había empezado.
 *
 * E3-07 · aquí se pasa lista. Antes era una casilla de sí/no que solo sabía
 * escribir 🟢, y el matiz (regular/mal) se remitía a una pantalla de ocho ejes
 * que el servidor ya había retirado con un 410: quien tocaba «Pasar lista» en
 * su panel no llegaba a ninguna parte. Ahora el gesto es el MISMO que en la web
 * —Bien / Regular / Mal más una frase opcional— y escribe por el mismo canal,
 * así que el color significa lo mismo en las dos superficies.
 */
export default function BriefDetailScreen() {
  const { id, d } = useLocalSearchParams<{ id: string; d?: string }>();
  const theme = useTheme();
  const { data, isLoading, isError, error, refetch, isRefetching } = useBriefDetail(id, d);

  const { needAttention, rest } = useMemo(() => {
    const roster = [...(data?.roster ?? [])].sort(
      (a, b) => (LIGHT_RANK[a.light ?? "GREEN"] ?? 2) - (LIGHT_RANK[b.light ?? "GREEN"] ?? 2)
    );
    return {
      needAttention: roster.filter((e) => e.light === "RED" || e.light === "AMBER"),
      rest: roster.filter((e) => e.light !== "RED" && e.light !== "AMBER"),
    };
  }, [data]);

  const counts = useMemo(() => {
    const roster = data?.roster ?? [];
    return {
      green: roster.filter((e) => !e.light || e.light === "GREEN").length,
      amber: roster.filter((e) => e.light === "AMBER").length,
      red: roster.filter((e) => e.light === "RED").length,
      checked: roster.filter((e) => e.debrief).length,
      total: roster.length,
    };
  }, [data]);

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="SESSION BRIEF"
          title={data?.session.name ?? "Sesión"}
          tight
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={() => goBack("/brief")}
              style={[styles.iconButton, { borderColor: theme.border }]}
            >
              <Icon name="chevron-left" size={17} color={theme.text} />
            </Pressable>
          }
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={4} shape="avatarRow" note="Cargando el brief…" />
      ) : isError || !data ? (
        <QueryErrorState error={error} title="No se pudo cargar la sesión" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <HeroCard padding={17}>
            <Text style={[typo.kicker, { color: theme.onInk.muted }]}>
              {data.session.startTime} · {data.session.centerName}
            </Text>
            <Text style={[styles.heroCount, { color: theme.onInk.text }]}>
              {counts.total} {counts.total === 1 ? "socio" : "socios"}
            </Text>
            {/* Semáforos en su versión sobre tinta: los de la piel clara son
                tonos oscuros para fondo hueso y aquí no se veían. */}
            <View style={styles.lightRow}>
              <LightCount color={theme.onInk.good} value={counts.green} label="sin restricción" />
              <LightCount color={theme.onInk.warning} value={counts.amber} label="adaptar" />
              <LightCount color={theme.onInk.critical} value={counts.red} label="evitar" />
            </View>
          </HeroCard>

          {!data.canSeeHealth ? (
            <Card style={{ borderColor: theme.warning }}>
              <Text style={[typo.rowMeta, { color: theme.warning }]}>
                Tu rol no tiene acceso a los indicadores de salud. Puedes marcar asistencia igualmente.
              </Text>
            </Card>
          ) : null}

          {counts.total === 0 ? (
            <EmptyState icon="users" title="Sin reservas" description="Nadie tiene reserva confirmada en esta sesión." />
          ) : (
            <>
              {needAttention.length > 0 ? (
                <>
                  <SectionTitle label="Requieren atención" />
                  {needAttention.map((entry, index) => (
                    <FadeInUp key={entry.bookingId} delay={stagger(index)}>
                      <RosterCard entry={entry} sessionId={id} />
                    </FadeInUp>
                  ))}
                </>
              ) : null}

              {rest.length > 0 ? (
                <>
                  <SectionTitle label="Sin restricciones" />
                  {rest.map((entry, index) => (
                    <FadeInUp key={entry.bookingId} delay={stagger(index)}>
                      <RosterCard entry={entry} sessionId={id} compact />
                    </FadeInUp>
                  ))}
                </>
              ) : null}
            </>
          )}
        </>
      )}

      {/* Barra flotante con el recuento: es lo que el entrenador mira al
          terminar de pasar lista, y va sobre la barra de pestañas. */}
      {counts.total > 0 ? (
        <View style={[styles.floating, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          <Text style={[typo.rowTitleSmall, { color: theme.text, flex: 1 }]}>
            Cerrar lista · {counts.checked} de {counts.total}
          </Text>
          <Button title="Cerrar" variant="gold" size="sm" onPress={() => goBack("/brief")} />
        </View>
      ) : null}
    </ScreenContainer>
  );
}

function LightCount({ color, value, label }: { color: string; value: number; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.lightItem}>
      <View style={[styles.lightDot, { backgroundColor: color }]} />
      <Text style={[styles.lightValue, { color: theme.onInk.text }]}>{value}</Text>
      {/* `flexShrink` + `minWidth: 0`: los tres rótulos juntos («sin
          restricción», «adaptar», «evitar») no caben en un móvil estrecho y sin
          esto se salían del héroe en vez de recortarse. */}
      <Text style={[typo.rowMetaSmall, styles.lightLabel, { color: theme.onInk.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Tarjeta de un socio del roster. `compact` es quien no lleva nada que adaptar:
 * misma tarjeta sin el bloque de adaptaciones, para que pasar lista sea el
 * mismo gesto en los dos grupos y no haya que buscarlo en dos sitios distintos.
 */
function RosterCard({ entry, sessionId, compact }: { entry: BriefRosterEntry; sessionId: string; compact?: boolean }) {
  const theme = useTheme();
  const accent = entry.light === "RED" ? theme.critical : entry.light === "AMBER" ? theme.warning : theme.good;
  const name = `${entry.member.firstName} ${entry.member.lastName}`;

  return (
    <Card padding={0} style={styles.rosterCard}>
      <View style={[styles.rosterBar, { backgroundColor: compact ? theme.separator : accent }]} />
      <View style={styles.rosterBody}>
        <View style={styles.rosterHeader}>
          <Avatar name={name} size={compact ? 34 : 36} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text
              style={[typo.rowMetaSmall, { color: compact ? theme.textMuted : accent }]}
              numberOfLines={1}
            >
              {compact
                ? entry.isNew
                  ? "Primera sesión"
                  : "Sin restricción activa"
                : `${entry.light === "RED" ? "Evitar bloques marcados" : "Adaptar bloques marcados"}${
                    entry.isNew ? " · primera sesión" : ""
                  }`}
            </Text>
          </View>
        </View>

        {!compact
          ? entry.matchedRules.map((rule, index) => (
              <View key={`rule-${index}`} style={[styles.adaptation, { backgroundColor: theme.sheet }]}>
                <Text style={[typo.rowTitleSmall, { color: theme.text }]}>{rule.blockArea}</Text>
                {rule.adaptation ? (
                  <Text style={[typo.rowMeta, { color: theme.textSecondary, lineHeight: 17 }]}>{rule.adaptation}</Text>
                ) : null}
              </View>
            ))
          : null}

        {/* Condición declarada sin regla asignada (RB-SALUD-010, E3-01/E3-03):
            no hay adaptación que pintar, pero no puede desaparecer del brief
            como si no existiera — es justo la que más se salta hoy. Sin
            descripción clínica (E3-05): solo tipo y zona. */}
        {!compact
          ? entry.unmatchedConditions.map((condition, index) => (
              <View
                key={`unmatched-${index}`}
                style={[styles.adaptation, { backgroundColor: theme.sheet, borderWidth: 1, borderColor: theme.warning }]}
              >
                <Text style={[typo.rowTitleSmall, { color: theme.warning }]}>Condición sin regla asignada</Text>
                <Text style={[typo.rowMeta, { color: theme.textSecondary, lineHeight: 17 }]}>
                  {conditionLabel(condition)}
                </Text>
              </View>
            ))
          : null}

        <DebriefControl entry={entry} sessionId={sessionId} name={name} />
      </View>
    </Card>
  );
}

/** Los tres colores del debrief, con el mismo rótulo que la web (E3-07). */
const FEELINGS: { value: DebriefFeeling; label: string }[] = [
  { value: "GREEN", label: "Bien" },
  { value: "AMBER", label: "Regular" },
  { value: "RED", label: "Mal" },
];

/**
 * «¿Cómo ha ido la sesión?» — el gesto con el que se pasa lista.
 *
 * Un toque guarda el color Y marca la asistencia; el segundo toque sobre el
 * color ya elegido la desmarca (E2-03: se manda al servidor, para que la
 * reserva vuelva a BOOKED y el bono no quede consumido a ciegas).
 *
 * La frase es opcional y NO bloquea: se guarda al salir del campo, y solo
 * cuando ya hay color, porque sin color no hay debrief que anotar.
 */
function DebriefControl({ entry, sessionId, name }: { entry: BriefRosterEntry; sessionId: string; name: string }) {
  const theme = useTheme();
  const toast = useToast();
  const [feeling, setFeeling] = useState<DebriefFeeling | null>(entry.debrief?.feeling ?? null);
  const [note, setNote] = useState(entry.debrief?.note ?? "");
  const [savedNote, setSavedNote] = useState(entry.debrief?.note ?? "");
  const saveDebrief = useSaveDebrief(sessionId);

  function tap(value: DebriefFeeling) {
    const previous = feeling;
    const next = feeling === value ? null : value;
    setFeeling(next);
    saveDebrief.mutate(
      { bookingId: entry.bookingId, feeling: next, note },
      {
        onError: (err) => {
          setFeeling(previous);
          toast.show(err instanceof Error ? err.message : "No se pudo guardar el debrief.", "critical");
        },
      }
    );
  }

  function saveNote() {
    if (!feeling || note.trim() === savedNote.trim()) return;
    const previous = savedNote;
    setSavedNote(note);
    saveDebrief.mutate(
      { bookingId: entry.bookingId, feeling, note },
      {
        onError: (err) => {
          setSavedNote(previous);
          toast.show(err instanceof Error ? err.message : "No se pudo guardar la nota.", "critical");
        },
      }
    );
  }

  return (
    <View style={[styles.debrief, { borderTopColor: theme.separator }]}>
      <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>¿Cómo ha ido la sesión?</Text>
      <View style={styles.feelingRow} accessibilityRole="radiogroup" accessibilityLabel={`Debrief de ${name}`}>
        {FEELINGS.map((option) => {
          const selected = feeling === option.value;
          const color =
            option.value === "GREEN" ? theme.good : option.value === "AMBER" ? theme.warning : theme.critical;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, busy: saveDebrief.isPending }}
              accessibilityLabel={`${option.label}${selected ? ", seleccionado: tócalo otra vez para quitarlo" : ""}`}
              disabled={saveDebrief.isPending}
              onPress={() => tap(option.value)}
              style={[
                styles.feeling,
                { borderColor: selected ? color : theme.border, backgroundColor: selected ? color : "transparent" },
              ]}
            >
              {!selected ? <View style={[styles.feelingDot, { backgroundColor: color }]} /> : null}
              <Text
                style={[typo.buttonSmall, { color: selected ? theme.inkText : theme.textSecondary }]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {feeling ? (
        <Field
          placeholder="Una frase, si hace falta (opcional)"
          value={note}
          onChangeText={setNote}
          onBlur={saveNote}
          maxLength={600}
          accessibilityLabel={`Nota del debrief de ${name}`}
        />
      ) : (
        <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>
          Un toque guarda el debrief y marca la asistencia.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroCount: { fontFamily: fonts.bold, fontSize: 26, marginTop: 6, ...tabular },
  lightRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  lightItem: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  lightLabel: { flexShrink: 1, minWidth: 0 },
  lightDot: { width: 10, height: 10, borderRadius: 5 },
  lightValue: { fontFamily: fonts.bold, fontSize: 14, ...tabular },
  rosterCard: { flexDirection: "row", overflow: "hidden" },
  rosterBar: { width: 3 },
  rosterBody: { flex: 1, padding: 15, gap: 11 },
  rosterHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  adaptation: { borderRadius: radii.control, padding: 12, gap: 4 },
  debrief: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 2 },
  feelingRow: { flexDirection: "row", gap: 7 },
  // 44 px de alto: los tres botones son el gesto principal de la pantalla y
  // tienen que cumplir el mínimo táctil aunque se repartan el ancho entre tres.
  feeling: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.control,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  feelingDot: { width: 8, height: 8, borderRadius: 4 },
  floating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: radii.control,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: layout.gap,
  },
});
