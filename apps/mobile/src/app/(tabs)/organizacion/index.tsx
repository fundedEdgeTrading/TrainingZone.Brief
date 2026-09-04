import { useMemo, useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useStaff } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Chip, ChipRow } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { pluralize } from "@/utils/format";
import type { Role, StaffMemberItem } from "@/api/types";

// D6 del handoff: equipo de la organización.
type Filter = "all" | "TRAINER" | "DIRECTION" | "RECEPTION";

const DIRECTION_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "PLATFORM_ADMIN", "HR_MANAGER"];

function matches(filter: Filter, member: StaffMemberItem): boolean {
  if (filter === "all") return true;
  if (filter === "DIRECTION") return DIRECTION_ROLES.includes(member.role);
  return member.role === filter;
}

/** "Entrenador · Centro Norte 60% · Centro Sur 40%" */
function metaOf(member: StaffMemberItem): string {
  const allocations = member.allocations.map((a) => `${a.centerName}${a.pct != null ? ` ${a.pct}%` : ""}`);
  return [member.roleLabel, ...allocations].join(" · ");
}

export default function StaffScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>("all");
  const { data, isLoading, isError, refetch, isRefetching } = useStaff();

  const staff = useMemo(() => (data?.staff ?? []).filter((member) => matches(filter, member)), [data, filter]);

  return (
    <ScreenContainer
      enter="auth"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}
    >
      <FadeInUp>
        <ScreenHeader
          kicker={`ORGANIZACIÓN · ${data ? pluralize(data.centers.length, "CENTRO", "CENTROS").toUpperCase() : ""}`}
          title="Equipo"
          right={
            data ? (
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{pluralize(data.staff.length, "persona", "personas")}</Text>
            ) : undefined
          }
        />
      </FadeInUp>

      <ChipRow>
        <Chip label="Todos" selected={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Entrenadores" selected={filter === "TRAINER"} onPress={() => setFilter("TRAINER")} />
        <Chip label="Dirección" selected={filter === "DIRECTION"} onPress={() => setFilter("DIRECTION")} />
        <Chip label="Recepción" selected={filter === "RECEPTION"} onPress={() => setFilter("RECEPTION")} />
      </ChipRow>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar el equipo" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {staff.length === 0 ? (
            <EmptyState icon="users" title="Sin personas en ese filtro" />
          ) : (
            staff.map((member, index) => (
              <FadeInUp key={member.id} delay={stagger(index)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Abrir la ficha de ${member.name}`}
                  onPress={() => router.push({ pathname: "/organizacion/[id]", params: { id: member.id } })}
                >
                  <Card padding={13} style={styles.row}>
                    <Avatar name={member.name} uri={member.image} size={44} />
                    {/* Los distintivos van DENTRO de la columna de texto y con
                        salto de línea. En la fila, «Invitación» y «Oculto»
                        ocupaban ~140 px fijos que no encogen, así que en un
                        móvil estrecho al nombre no le quedaba prácticamente
                        ancho y salía recortado a dos letras. */}
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                        {metaOf(member)}
                      </Text>
                      {member.invitationPending || !member.visibleInApp ? (
                        <View style={styles.badgeRow}>
                          {member.invitationPending ? <Badge label="Invitación" tone="warning" /> : null}
                          {!member.visibleInApp ? <Badge label="Oculto" tone="outline" /> : null}
                        </View>
                      ) : null}
                    </View>
                    <Icon name="chevron-right" size={15} color={theme.textFaint} />
                  </Card>
                </Pressable>
              </FadeInUp>
            ))
          )}

          {data.canManage ? (
            <Button
              title="+ Nuevo miembro"
              variant="gold"
              onPress={() => router.push({ pathname: "/organizacion/[id]", params: { id: "nuevo" } })}
            />
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
});
