import { RefreshControl, Text, View } from "react-native";
import { router } from "expo-router";
import { useTrainerPanel } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ListRow, Divider } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";

// Índice de C4: qué sesiones esperan feedback y cuáles ya se han dado hoy.
export default function FeedbackIndexScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerPanel();

  const today = (data?.todaySessions ?? []).filter((s) => s.status !== "upcoming");

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker="FEEDBACK" title="Puntúa a tus socios" />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {data.pendingDebriefs.length > 0 ? (
            <>
              <SectionTitle label="Pendiente" />
              <Card style={{ borderColor: theme.warning, gap: 6 }}>
                {data.pendingDebriefs.map((item, index) => (
                  <View key={`${item.sessionId}-${item.occurrenceDate}`}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow
                      title={item.title}
                      meta={`${item.relative} · ${item.detail}`}
                      right={
                        <Button
                          title="Rellenar"
                          variant="gold"
                          size="sm"
                          onPress={() =>
                            router.push({
                              pathname: "/feedback/[id]",
                              params: { id: item.sessionId, d: item.occurrenceDate },
                            })
                          }
                        />
                      }
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : (
            <Card style={{ gap: 6 }}>
              <Badge label="Al día" tone="good" dot />
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                No tienes feedback pendiente. Al terminar una sesión aparecerá aquí.
              </Text>
            </Card>
          )}

          <SectionTitle label="Sesiones de hoy" />
          {today.length === 0 ? (
            <EmptyState icon="clock" title="Todavía no ha terminado ninguna sesión hoy" />
          ) : (
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              {today.map((session, index) => (
                <View key={`${session.id}-${session.startTime}`} style={{ paddingHorizontal: 14 }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow
                    title={session.title}
                    meta={`${session.startTime}–${session.endTime} · ${session.meta}`}
                    chevron
                    onPress={() =>
                      router.push({ pathname: "/feedback/[id]", params: { id: session.id, d: data.agendaDay } })
                    }
                  />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </ScreenContainer>
  );
}
