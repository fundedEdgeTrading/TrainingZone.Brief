import { ActivityIndicator, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useBriefList } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";

export default function BriefListScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useBriefList();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <FadeInUp>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>SESSION BRIEF</Text>
        <Text style={[styles.title, { color: theme.text }]}>Próximas sesiones</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>
          Elige una sesión para tu repaso de 90 segundos antes de abrir la puerta.
        </Text>
      </FadeInUp>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar el Session Brief" description="Desliza hacia abajo para reintentar." />
      ) : data.sessions.length === 0 ? (
        <EmptyState title="Sin sesiones próximas" description="No hay sesiones asignadas en los próximos días." />
      ) : (
        data.sessions.map((s) => (
          <Pressable
            key={`${s.id}-${s.occurrenceDate}`}
            onPress={() => router.push({ pathname: "/brief/[id]", params: { id: s.id, d: s.occurrenceDate } })}
          >
            <Card>
              <Text style={[styles.sessionDay, { color: theme.textMuted }]}>
                {s.isToday ? "Hoy" : s.dayLabel} · {s.startTime}
              </Text>
              <Text style={[styles.sessionName, { color: theme.text }]}>{s.name}</Text>
              <View style={styles.sessionFooter}>
                <Text style={[styles.sessionMeta, { color: theme.textMuted }]}>
                  {s.centerName} · {s.trainerName ?? "Sin entrenador"}
                </Text>
                <Badge label={`${s.bookingsCount} reservas`} tone="neutral" />
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  subtitle: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 6 },
  sessionDay: { fontFamily: "Poppins_600SemiBold", fontSize: 11, textTransform: "uppercase" },
  sessionName: { fontFamily: "Poppins_600SemiBold", fontSize: 16, marginTop: 2 },
  sessionFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  sessionMeta: { fontFamily: "Poppins_400Regular", fontSize: 12 },
});
