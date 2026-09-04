import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
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
import { Icon } from "@/components/Icon";
import { Divider, ListRow } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { BriefRosterEntry } from "@/api/types";

const LIGHT_RANK: Record<string, number> = { RED: 0, AMBER: 1, GREEN: 2 };

/**
 * Session Brief: con quién estás a punto de entrenar y qué hay que adaptarle.
 *
 * El orden es lo que hace útil esta pantalla: PRIMERO quien requiere atención
 * (rojo, luego ámbar), y los socios sin restricción en una lista compacta al
 * final. Ordenado por nombre —como estaba— el rojo aparecía en la posición 5 de
 * 6 y se leía cuando la sesión ya había empezado.
 *
 * Un toque en el botón de asistencia guarda el debrief y marca asistencia, que
 * es lo que ya hacía el código; lo que cambia es que ahora ese botón se ve
 * desde la fila, sin desplegar nada.
 */
export default function BriefDetailScreen() {
  const { id, d } = useLocalSearchParams<{ id: string; d?: string }>();
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useBriefDetail(id, d);

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
              onPress={() => router.back()}
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
        <EmptyState icon="alert" title="No se pudo cargar la sesión" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <FadeInUp delay={stagger(1)}>
            <HeroCard padding={17}>
              <Text style={[typo.kicker, { color: theme.onInk.muted }]}>
                {data.session.startTime} · {data.session.centerName}
              </Text>
              <Text style={[styles.heroCount, { color: theme.onInk.text }]}>
                {counts.total} {counts.total === 1 ? "socio" : "socios"}
              </Text>
              <View style={styles.lightRow}>
                <LightCount color={theme.good} value={counts.green} label="sin restricción" />
                <LightCount color={theme.warning} value={counts.amber} label="adaptar" />
                <LightCount color={theme.critical} value={counts.red} label="evitar" />
              </View>
            </HeroCard>
          </FadeInUp>

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
                  <Card tone="alt" padding={0} style={{ gap: 0 }}>
                    {rest.map((entry, index) => (
                      <View key={entry.bookingId} style={styles.listInset}>
                        {index > 0 ? <Divider /> : null}
                        <CompactRow entry={entry} sessionId={id} />
                      </View>
                    ))}
                  </Card>
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
          <Button title="Cerrar" variant="gold" size="sm" onPress={() => router.back()} />
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
      <Text style={[typo.rowMetaSmall, { color: theme.onInk.muted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Tarjeta completa: para quien lleva restricción, con la adaptación literal. */
function RosterCard({ entry, sessionId }: { entry: BriefRosterEntry; sessionId: string }) {
  const theme = useTheme();
  const toast = useToast();
  const [feeling, setFeeling] = useState(entry.debrief?.feeling ?? null);
  const saveDebrief = useSaveDebrief(sessionId);
  const accent = entry.light === "RED" ? theme.critical : entry.light === "AMBER" ? theme.warning : theme.good;

  function markAttendance() {
    const previous = feeling;
    // Un toque = asistió y el debrief queda en verde; el matiz (regular/mal) se
    // afina en el feedback 1-10, que es donde hay ocho ejes para decirlo.
    const next = feeling ? null : "GREEN";
    setFeeling(next);
    if (!next) return;
    saveDebrief.mutate(
      { bookingId: entry.bookingId, feeling: next },
      {
        onError: () => {
          setFeeling(previous);
          toast.show("No se pudo marcar la asistencia.", "critical");
        },
      }
    );
  }

  return (
    <Card padding={0} style={styles.rosterCard}>
      <View style={[styles.rosterBar, { backgroundColor: accent }]} />
      <View style={styles.rosterBody}>
        <View style={styles.rosterHeader}>
          <Avatar name={`${entry.member.firstName} ${entry.member.lastName}`} size={36} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {entry.member.firstName} {entry.member.lastName}
            </Text>
            <Text style={[typo.rowMetaSmall, { color: accent }]} numberOfLines={1}>
              {entry.light === "RED" ? "Evitar bloques marcados" : "Adaptar bloques marcados"}
              {entry.isNew ? " · primera sesión" : ""}
            </Text>
          </View>
          <AttendanceButton checked={Boolean(feeling)} busy={saveDebrief.isPending} onPress={markAttendance} />
        </View>

        {entry.matchedRules.map((rule, index) => (
          <View key={index} style={[styles.adaptation, { backgroundColor: theme.sheet }]}>
            <Text style={[typo.rowTitleSmall, { color: theme.text }]}>{rule.blockArea}</Text>
            {rule.adaptation ? (
              <Text style={[typo.rowMeta, { color: theme.textSecondary, lineHeight: 17 }]}>{rule.adaptation}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Fila compacta: para quien no lleva nada que adaptar. */
function CompactRow({ entry, sessionId }: { entry: BriefRosterEntry; sessionId: string }) {
  const [feeling, setFeeling] = useState(entry.debrief?.feeling ?? null);
  const saveDebrief = useSaveDebrief(sessionId);

  return (
    <ListRow
      left={<Avatar name={`${entry.member.firstName} ${entry.member.lastName}`} size={34} />}
      title={`${entry.member.firstName} ${entry.member.lastName}`}
      meta={entry.isNew ? "Primera sesión" : undefined}
      right={
        <AttendanceButton
          checked={Boolean(feeling)}
          busy={saveDebrief.isPending}
          onPress={() => {
            if (feeling) {
              setFeeling(null);
              return;
            }
            setFeeling("GREEN");
            saveDebrief.mutate({ bookingId: entry.bookingId, feeling: "GREEN" }, { onError: () => setFeeling(null) });
          }}
        />
      }
    />
  );
}

function AttendanceButton({ checked, busy, onPress }: { checked: boolean; busy: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, busy }}
      accessibilityLabel={checked ? "Quitar asistencia" : "Marcar asistencia"}
      disabled={busy}
      hitSlop={6}
      onPress={onPress}
      style={[
        styles.attendance,
        { borderColor: checked ? theme.good : theme.border, backgroundColor: checked ? theme.good : "transparent" },
      ]}
    >
      <Icon name="check" size={16} color={checked ? theme.inkText : theme.textFaint} strokeWidth={checked ? 2.4 : 1.7} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  heroCount: { fontFamily: fonts.bold, fontSize: 26, marginTop: 6, ...tabular },
  lightRow: { flexDirection: "row", gap: 16, marginTop: 12 },
  lightItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  lightDot: { width: 10, height: 10, borderRadius: 5 },
  lightValue: { fontFamily: fonts.bold, fontSize: 14, ...tabular },
  rosterCard: { flexDirection: "row", overflow: "hidden" },
  rosterBar: { width: 3 },
  rosterBody: { flex: 1, padding: 15, gap: 11 },
  rosterHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  adaptation: { borderRadius: radii.control, padding: 12, gap: 4 },
  attendance: { width: 38, height: 38, borderRadius: radii.control, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  listInset: { paddingHorizontal: 14 },
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
