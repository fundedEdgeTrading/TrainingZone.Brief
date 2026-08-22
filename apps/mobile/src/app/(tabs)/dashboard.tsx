import { useState } from "react";
import { RefreshControl, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useDashboard } from "@/api/queries";
import { useTheme, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Chip, ChipRow } from "@/components/Chip";
import { HeroCard } from "@/components/HeroCard";
import { KpiTile } from "@/components/KpiTile";
import { ProgressBar } from "@/components/ProgressBar";
import { Sparkline } from "@/components/Sparkline";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { capitalize, formatEuros } from "@/utils/format";

// D1 del handoff: panel de control de dirección.
export default function DashboardScreen() {
  const theme = useTheme();
  const { state } = useAuth();
  const { width } = useWindowDimensions();
  const [centerId, setCenterId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch, isRefetching } = useDashboard(centerId);

  const user = state.status === "signedIn" ? state.user : null;
  const monthLabel = capitalize(new Date().toLocaleDateString("es-ES", { month: "long" }));

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker={`DIRECCIÓN · ${monthLabel.toUpperCase()}`}
          title="Panel de control"
          tight
          right={<Avatar name={user?.name ?? ""} uri={user?.image} size={42} />}
        />
      </FadeInUp>

      {data && data.canChooseCenter && data.centers.length > 1 ? (
        <ChipRow>
          <Chip
            label={`${data.centers.length} centros`}
            tone="bone"
            selected={centerId === null}
            onPress={() => setCenterId(null)}
          />
          {data.centers.map((center) => (
            <Chip
              key={center.id}
              label={center.name}
              tone="bone"
              selected={centerId === center.id}
              onPress={() => setCenterId(center.id)}
            />
          ))}
        </ChipRow>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar el panel" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <FadeInUp delay={stagger(1)}>
            <HeroCard>
              <Text style={[typo.kicker, { color: theme.goldSoft }]}>INGRESOS DEL MES</Text>
              <View style={styles.revenueRow}>
                <Text style={[typo.heroSmall, { color: theme.onInk.text }]}>{formatEuros(data.revenue.monthCents)}</Text>
                {data.revenue.deltaPct != null ? (
                  <Badge
                    label={`${data.revenue.deltaPct > 0 ? "+" : ""}${data.revenue.deltaPct.toLocaleString("es-ES")}%`}
                    tone={data.revenue.deltaPct >= 0 ? "good" : "critical"}
                  />
                ) : null}
              </View>

              <View style={{ marginTop: 14 }}>
                <Sparkline
                  values={data.revenue.series.map((point) => point.cents)}
                  labels={data.revenue.series.map((point) => point.label)}
                  width={width - layout.screenPadding * 2 - 40}
                />
              </View>
            </HeroCard>
          </FadeInUp>

          <FadeInUp delay={stagger(2)} style={styles.kpiRow}>
            <KpiTile
              label="Socios activos"
              value={`${data.members.active}`}
              hint={`+${data.members.newThisMonth} altas · −${data.members.churnedThisMonth} bajas`}
              hintTone="good"
            />
            <KpiTile
              label="Morosidad"
              value={formatEuros(data.delinquency.amountCents)}
              tone="critical"
              hint={`${data.delinquency.members} ${data.delinquency.members === 1 ? "socio" : "socios"}`}
              small
            />
            <KpiTile label="Asistencia media" value={`${data.attendance.avgPct}%`} tone="good" full>
              <View style={{ marginTop: 8, gap: 6 }}>
                <ProgressBar pct={data.attendance.avgPct} color={theme.good} />
                <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
                  {data.attendance.sessionsHeld} sesiones celebradas · {data.attendance.noShowPct}% de no-show (30 días)
                </Text>
              </View>
            </KpiTile>
          </FadeInUp>

          {data.ranking && data.ranking.length > 0 ? (
            <>
              <SectionTitle label="Ranking de entrenadores" />
              <FadeInUp delay={stagger(3)}>
                <Card style={{ gap: 12 }}>
                  {data.ranking.map((trainer, index) => (
                    <View key={trainer.trainerUserId} style={styles.rankRow}>
                      <Text style={[styles.rankPosition, { color: index === 0 ? theme.goldText : theme.textFaint }]}>
                        {index + 1}
                      </Text>
                      <Avatar name={trainer.name} uri={trainer.image} size={30} />
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={[typo.rowTitleSmall, { color: theme.text }]} numberOfLines={1}>
                          {trainer.name}
                        </Text>
                        <ProgressBar
                          pct={(trainer.avgScore / 10) * 100}
                          color={index === 0 ? theme.gold : theme.ink}
                          height={4}
                        />
                      </View>
                      <Text style={[styles.rankScore, { color: theme.text }]}>
                        {trainer.avgScore.toLocaleString("es-ES", { minimumFractionDigits: 1 })}
                      </Text>
                    </View>
                  ))}
                </Card>
              </FadeInUp>
            </>
          ) : null}

          <SectionTitle label="Atajos" />
          <View style={styles.shortcuts}>
            <Button title="Agenda del centro" variant="outline" style={{ flex: 1 }} onPress={() => router.push("/staff-agenda")} />
            <Button title="Socios" variant="outline" style={{ flex: 1 }} onPress={() => router.push("/socios")} />
          </View>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  revenueRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  rankPosition: { fontFamily: fonts.bold, fontSize: 12, width: 14, ...tabular },
  rankScore: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
  shortcuts: { flexDirection: "row", gap: 10 },
});
