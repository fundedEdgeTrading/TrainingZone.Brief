import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useBriefList } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { goBack } from "@/utils/navigation";
import { pluralize } from "@/utils/format";

/**
 * Índice del Session Brief. Esta pantalla se había quedado fuera del sistema de
 * diseño —tipografías escritas a mano en vez de la escala, `ActivityIndicator`
 * gris en vez del esqueleto, sin cabecera con vuelta y sin iconos—, así que
 * entrar aquí desde «Más» parecía otra app. Ahora usa las mismas piezas que el
 * resto: cabecera con kicker, esqueleto por filas y tarjetas con su badge.
 */
export default function BriefListScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useBriefList();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="SESSION BRIEF"
          title="Próximas sesiones"
          tight
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={() => goBack("/mas")}
              style={[styles.iconButton, { borderColor: theme.border }]}
            >
              <Icon name="chevron-left" size={17} color={theme.text} />
            </Pressable>
          }
        />
      </FadeInUp>

      <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
        Elige una sesión para tu repaso de 90 segundos antes de abrir la puerta.
      </Text>

      {isLoading ? (
        <SkeletonList rows={4} shape="row" note="Cargando tus sesiones…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar el Session Brief" description="Desliza hacia abajo para reintentar." />
      ) : data.sessions.length === 0 ? (
        <EmptyState icon="calendar" title="Sin sesiones próximas" description="No hay sesiones asignadas en los próximos días." />
      ) : (
        data.sessions.map((s, index) => (
          <FadeInUp key={`${s.id}-${s.occurrenceDate}`} delay={stagger(index)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir el brief de ${s.name}`}
              onPress={() => router.push({ pathname: "/brief/[id]", params: { id: s.id, d: s.occurrenceDate } })}
            >
              <Card style={{ gap: 6 }}>
                <Text style={[typo.legend, { color: s.isToday ? theme.goldText : theme.textMuted }]}>
                  {s.isToday ? "HOY" : s.dayLabel.toUpperCase()} · {s.startTime}
                </Text>
                <Text style={[typo.cardTitleSmall, { color: theme.text }]} numberOfLines={1}>
                  {s.name}
                </Text>
                <View style={styles.footer}>
                  <Text style={[typo.rowMeta, { color: theme.textMuted, flex: 1 }]} numberOfLines={1}>
                    {s.centerName} · {s.trainerName ?? "Sin entrenador"}
                  </Text>
                  <Badge label={pluralize(s.bookingsCount, "reserva", "reservas")} tone="neutral" />
                </View>
              </Card>
            </Pressable>
          </FadeInUp>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 2 },
});
