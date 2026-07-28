import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useBriefDetail, useSaveDebrief } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import type { BriefRosterEntry } from "@/api/types";

const LIGHT_LABEL: Record<string, { label: string; tone: "critical" | "warning" | "good" }> = {
  RED: { label: "Evitar bloques marcados", tone: "critical" },
  AMBER: { label: "Adaptar bloques marcados", tone: "warning" },
  GREEN: { label: "Libre, sin restricción", tone: "good" },
};

const FEELINGS: { value: "GREEN" | "AMBER" | "RED"; label: string }[] = [
  { value: "GREEN", label: "Bien" },
  { value: "AMBER", label: "Regular" },
  { value: "RED", label: "Mal" },
];

export default function BriefDetailScreen() {
  const { id, d } = useLocalSearchParams<{ id: string; d?: string }>();
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useBriefDetail(id, d);

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar la sesión" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>{data.session.name}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {data.session.startTime} · {data.session.centerName} · {data.session.trainerName ?? "Sin entrenador"}
            </Text>
          </View>

          {!data.canSeeHealth && (
            <Card style={{ backgroundColor: theme.warningBg, borderColor: theme.warningBg }}>
              <Text style={{ color: theme.warning, fontFamily: "Poppins_500Medium", fontSize: 13 }}>
                Tu rol no tiene acceso a los indicadores de salud. Puedes registrar el debrief igualmente.
              </Text>
            </Card>
          )}

          {data.roster.length === 0 ? (
            <EmptyState title="Sin reservas" description="Nadie tiene reserva confirmada en esta sesión." />
          ) : (
            data.roster.map((entry) => <RosterCard key={entry.bookingId} entry={entry} sessionId={id} />)
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function RosterCard({ entry, sessionId }: { entry: BriefRosterEntry; sessionId: string }) {
  const theme = useTheme();
  const [feeling, setFeeling] = useState(entry.debrief?.feeling ?? null);
  const saveDebrief = useSaveDebrief(sessionId);
  const style = entry.light ? LIGHT_LABEL[entry.light] : null;

  function tap(f: "GREEN" | "AMBER" | "RED") {
    const previous = feeling;
    setFeeling(f);
    saveDebrief.mutate(
      { bookingId: entry.bookingId, feeling: f },
      { onError: () => setFeeling(previous) }
    );
  }

  return (
    <Card>
      <View style={styles.rosterHeader}>
        <Text style={[styles.memberName, { color: theme.text }]}>
          {entry.member.firstName} {entry.member.lastName}
        </Text>
        {entry.isNew ? <Badge label="Nuevo" tone="neutral" /> : null}
      </View>

      {style ? (
        <Badge label={style.label} tone={style.tone} />
      ) : (
        <Badge label="Sin restricciones" tone="neutral" />
      )}
      {entry.matchedRules.map((r, i) => (
        <Text key={i} style={[styles.conditionText, { color: theme.textSecondary }]}>
          {r.blockArea}
          {r.adaptation ? ` — ${r.adaptation}` : ""}
        </Text>
      ))}

      <View style={styles.feelingRow}>
        {FEELINGS.map((f) => {
          const selected = feeling === f.value;
          return (
            <Pressable
              key={f.value}
              disabled={saveDebrief.isPending}
              onPress={() => tap(f.value)}
              style={[
                styles.feelingButton,
                { borderColor: theme.border, backgroundColor: selected ? theme.ink : "transparent" },
              ]}
            >
              <Text style={[styles.feelingText, { color: selected ? theme.inkText : theme.textSecondary }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>
        {saveDebrief.isPending ? "Guardando…" : feeling ? "✓ Debrief guardado" : "Un toque guarda el debrief y marca asistencia."}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: "Poppins_700Bold", fontSize: 20 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  rosterHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  memberName: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  conditionText: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 2 },
  feelingRow: { flexDirection: "row", gap: 6, marginTop: 8 },
  feelingButton: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  feelingText: { fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  hint: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 6 },
});
