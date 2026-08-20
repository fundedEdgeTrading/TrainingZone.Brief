import { useState } from "react";
import { RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useMemberships } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ProgressRing } from "@/components/ProgressRing";
import { Divider } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { formatDayMonth, formatEuros } from "@/utils/format";
import type { ConsumptionItem, MembershipItem } from "@/api/types";

// B4 del handoff: "Mis bonos" — un anillo por bono y el histórico de consumos.
export default function MembershipsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useMemberships();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker="MI MEMBRESÍA" title="Mis bonos" />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={2} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar tus bonos" description="Desliza hacia abajo para reintentar." />
      ) : data.memberships.length === 0 ? (
        <EmptyState icon="wallet" title="Todavía no tienes ningún bono" description="Elige tu plan y empieza a reservar." />
      ) : (
        <>
          {data.memberships.map((membership, index) => (
            <FadeInUp key={membership.id} delay={stagger(index + 1)}>
              <MembershipCard
                membership={membership}
                expanded={expanded === membership.id}
                onToggle={() => setExpanded((current) => (current === membership.id ? null : membership.id))}
                consumption={data.consumption.filter((c) => c.planName === membership.planName)}
              />
            </FadeInUp>
          ))}

          {data.consumption.length > 0 ? (
            <>
              <SectionTitle label="Últimos consumos" />
              <Card tone="alt" padding={0} style={{ gap: 0 }}>
                {data.consumption.map((item, index) => (
                  <View key={item.bookingId}>
                    {index > 0 ? <Divider /> : null}
                    <ConsumptionRow item={item} />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}

      <Button title="Comprar o ampliar bono" variant="outline" onPress={() => router.push("/onboarding/planes")} />
    </ScreenContainer>
  );
}

function MembershipCard({
  membership,
  expanded,
  onToggle,
  consumption,
}: {
  membership: MembershipItem;
  expanded: boolean;
  onToggle: () => void;
  consumption: ConsumptionItem[];
}) {
  const theme = useTheme();
  const isPersonal = membership.serviceKind === "EP";
  const ringColor = isPersonal ? theme.gold : theme.ink;
  const pct =
    membership.unlimited || !membership.total ? 100 : Math.round(((membership.remaining ?? 0) / membership.total) * 100);

  return (
    <Card padding={15} style={{ gap: 12 }}>
      <View style={styles.row}>
        <ProgressRing progressPct={pct} size={88} strokeWidth={6} color={ringColor} trackColor={theme.surfaceAlt} onInk={false}>
          <Text style={[styles.ringValue, { color: theme.text }]}>
            {membership.unlimited ? "∞" : membership.remaining ?? 0}
          </Text>
          {membership.total ? <Text style={[typo.legend, { color: theme.textMuted }]}>DE {membership.total}</Text> : null}
        </ProgressRing>

        <View style={{ flex: 1, gap: 6 }}>
          <Text style={[typo.cardTitle, { color: theme.text }]} numberOfLines={2}>
            {membership.planName}
          </Text>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
            {membership.renewsAt ? `Renueva el ${formatDayMonth(`${membership.renewsAt}T00:00:00`)}` : "Sin fecha de renovación"}
            {membership.centerName ? ` · ${membership.centerName}` : ""}
          </Text>
          <View style={styles.badgeRow}>
            <Badge
              label={membership.status === "ACTIVE" ? "Activo" : membership.status === "FROZEN" ? "Congelado" : membership.status}
              tone={membership.status === "ACTIVE" ? "good" : "warning"}
            />
            <Badge label={`${formatEuros(membership.priceCents)}${membership.isRecurring ? "/mes" : ""}`} tone="neutral" />
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button
          title={expanded ? "Ocultar consumo" : "Ver consumo"}
          variant="outline"
          size="sm"
          onPress={onToggle}
          style={{ flex: 1 }}
        />
        <Button title="Ampliar" size="sm" onPress={() => router.push("/onboarding/planes")} style={{ flex: 1 }} />
      </View>

      {expanded ? (
        <Card tone="alt" padding={0} style={{ gap: 0 }}>
          {consumption.length === 0 ? (
            <Text style={[typo.rowMeta, { color: theme.textMuted, padding: 14 }]}>
              Todavía no has gastado ninguna sesión de este bono.
            </Text>
          ) : (
            consumption.map((item, index) => (
              <View key={item.bookingId}>
                {index > 0 ? <Divider /> : null}
                <ConsumptionRow item={item} />
              </View>
            ))
          )}
        </Card>
      ) : null}
    </Card>
  );
}

function ConsumptionRow({ item }: { item: ConsumptionItem }) {
  const theme = useTheme();
  const noShow = item.status === "NO_SHOW";

  return (
    <View style={styles.consumptionRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitleSmall, { color: theme.text }]} numberOfLines={1}>
          {item.sessionName}
        </Text>
        <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]}>
          {formatDayMonth(`${item.day}T00:00:00`)} · {item.startTime} · {noShow ? "No presentada" : "Realizada"}
        </Text>
      </View>
      <Text style={[styles.delta, { color: noShow ? theme.critical : theme.good }]}>
        {item.consumed ? `−${item.consumed} ${item.serviceKind === "EP" ? "personal" : "grupo"}` : "Sin consumo"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  ringValue: { fontFamily: fonts.bold, fontSize: 22, ...tabular },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  actions: { flexDirection: "row", gap: 8 },
  consumptionRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 13 },
  delta: { fontFamily: fonts.bold, fontSize: 11.5, ...tabular },
});
