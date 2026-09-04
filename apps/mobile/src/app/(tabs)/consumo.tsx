import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { goBack } from "@/utils/navigation";
import { useConsumption } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Chip, ChipRow } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { capitalize, formatDayMonth } from "@/utils/format";
import type { ConsumptionMovement } from "@/api/types";

type Filter = "all" | "EP" | "GROUP";

/**
 * «Historial de consumo»: el libro mayor del bono.
 *
 * No es la lista de clases a las que fue el socio —eso ya está en Sesiones—:
 * son MOVIMIENTOS de saldo con su signo y su motivo. Un socio que ve «te
 * quedan 4» y no sabe por qué, no puede discutirlo; con −1 por cada sesión, −1
 * en rojo por la no presentada, +1 por la que le devolvió el entrenador y +8 de
 * la renovación, la cuenta la puede rehacer él mismo.
 */
export default function ConsumptionScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isError, refetch, isRefetching } = useConsumption();

  const bono = data?.balances.find((b) => !b.unlimited) ?? data?.balances[0];

  const groups = useMemo(() => {
    const movements = (data?.movements ?? []).filter((m) =>
      filter === "all" ? true : m.serviceKind === null || m.serviceKind === filter
    );
    const byMonth = new Map<string, ConsumptionMovement[]>();
    for (const movement of movements) {
      const month = movement.day.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), movement]);
    }
    return [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data, filter]);

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="TU BONO, MOVIMIENTO A MOVIMIENTO"
          title="Historial de consumo"
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

      {isLoading ? (
        <SkeletonList rows={5} shape="row" note="Cargando tus movimientos…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar tu historial" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {bono ? (
            <FadeInUp delay={stagger(1)}>
              <Card style={{ gap: 14 }}>
                <View style={styles.balanceHeader}>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.balanceValue, { color: theme.text }]}>
                      {bono.unlimited ? "∞" : `${bono.remaining ?? 0}/${bono.total ?? 0}`}
                    </Text>
                    <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                      Disponibles
                      {bono.renewsAt ? ` · renueva el ${formatDayMonth(bono.renewsAt)}` : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.counters}>
                  <Counter label="Gastadas" value={data.summary.spent} color={theme.text} />
                  <Counter label="Devueltas" value={data.summary.returned} color={theme.good} />
                  <Counter label="No presentadas" value={data.summary.noShow} color={theme.critical} />
                </View>
              </Card>
            </FadeInUp>
          ) : null}

          <ChipRow>
            <Chip label="Todo" selected={filter === "all"} onPress={() => setFilter("all")} />
            <Chip label="Personal" selected={filter === "EP"} onPress={() => setFilter("EP")} />
            <Chip label="Grupos" selected={filter === "GROUP"} onPress={() => setFilter("GROUP")} />
          </ChipRow>

          {groups.length === 0 ? (
            <EmptyState icon="wallet" title="Sin movimientos" description="Aquí aparece cada sesión gastada y cada devolución." />
          ) : (
            groups.map(([month, movements]) => (
              <View key={month} style={{ gap: 10 }}>
                <Text style={[typo.kicker, { color: theme.textMuted, marginTop: 4 }]}>{monthLabel(month)}</Text>
                {movements.map((movement, index) => (
                  <FadeInUp key={movement.id} delay={stagger(index)}>
                    <MovementRow movement={movement} />
                  </FadeInUp>
                ))}
              </View>
            ))
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return capitalize(new Date(year, monthNumber - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" }));
}

function MovementRow({ movement }: { movement: ConsumptionMovement }) {
  const theme = useTheme();
  const color =
    movement.tone === "good" ? theme.good : movement.tone === "critical" ? theme.critical : theme.textSecondary;
  const date = new Date(`${movement.day}T00:00:00`);

  return (
    <Card padding={13} style={styles.movementCard}>
      <View style={[styles.dateBlock, { backgroundColor: theme.surfaceAlt }]}>
        <Text style={[styles.dateWeekday, { color: theme.textMuted }]}>
          {date.toLocaleDateString("es-ES", { month: "short" }).slice(0, 3).toUpperCase()}
        </Text>
        <Text style={[styles.dateNumber, { color: theme.text }]}>{date.getDate()}</Text>
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {movement.concept}
        </Text>
        {movement.reason ? (
          <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={2}>
            {movement.reason}
          </Text>
        ) : null}
      </View>

      {/* El signo delante y el color detrás: son las dos señales que permiten
          rehacer la cuenta sin leer la fila entera. */}
      <Text style={[styles.delta, { color }]}>
        {movement.delta > 0 ? "+" : "−"}
        {Math.abs(movement.delta)}
      </Text>
    </Card>
  );
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.counter}>
      <Text style={[styles.counterValue, { color }]}>{value}</Text>
      <Text style={[typo.kpiLabel, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  balanceHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  balanceValue: { fontFamily: fonts.bold, fontSize: 34, letterSpacing: -0.6, ...tabular },
  counters: { flexDirection: "row", gap: 10 },
  counter: { flex: 1, gap: 2 },
  counterValue: { fontFamily: fonts.bold, fontSize: 19, ...tabular },
  movementCard: { flexDirection: "row", alignItems: "center", gap: 11 },
  dateBlock: { width: 40, height: 44, borderRadius: radii.chip, alignItems: "center", justifyContent: "center" },
  dateWeekday: { fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.8 },
  dateNumber: { fontFamily: fonts.bold, fontSize: 15, ...tabular },
  delta: { fontFamily: fonts.bold, fontSize: 16, ...tabular },
});
