import { useState } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useMembers } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { Field } from "@/components/Field";
import { Chip, ChipRow } from "@/components/Chip";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import type { MemberState } from "@/api/types";

// D2 del handoff: socios con buscador y chips de estado.
const STATE_BADGE: Record<MemberState, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Activa", tone: "good" },
  DELINQUENT: { label: "Moroso", tone: "critical" },
  FROZEN: { label: "Congel.", tone: "warning" },
  TRIAL: { label: "Prueba", tone: "neutral" },
  PROSPECT: { label: "Prospecto", tone: "neutral" },
  CANCELLED: { label: "Baja", tone: "outline" },
};

export default function MembersScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [state, setState] = useState<MemberState | undefined>();
  const { data, isLoading, isError, refetch, isRefetching } = useMembers(search, state);

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker="DIRECCIÓN" title="Socios" />
      </FadeInUp>

      <Field
        placeholder="Buscar por nombre o email"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        right={<Icon name="search" size={16} color={theme.textFaint} />}
      />

      <ChipRow>
        <Chip label={`Todos${data ? ` ${data.counts.all}` : ""}`} selected={!state} onPress={() => setState(undefined)} />
        <Chip
          label={`Activos${data ? ` ${data.counts.active}` : ""}`}
          selected={state === "ACTIVE"}
          onPress={() => setState("ACTIVE")}
        />
        <Chip
          label={`Morosos${data ? ` ${data.counts.delinquent}` : ""}`}
          tone="critical"
          selected={state === "DELINQUENT"}
          onPress={() => setState("DELINQUENT")}
        />
        <Chip
          label={`Bajas${data ? ` ${data.counts.cancelled}` : ""}`}
          selected={state === "CANCELLED"}
          onPress={() => setState("CANCELLED")}
        />
      </ChipRow>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar los socios" description="Desliza hacia abajo para reintentar." />
      ) : data.members.length === 0 ? (
        <EmptyState icon="users" title="Sin resultados" description="Prueba con otro nombre o quita los filtros." />
      ) : (
        data.members.map((member, index) => {
          const badge = STATE_BADGE[member.state];
          const delinquent = member.state === "DELINQUENT";
          return (
            <FadeInUp key={member.id} delay={stagger(index)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir la ficha de ${member.name}`}
                onPress={() => router.push({ pathname: "/socios/[id]", params: { id: member.id } })}
              >
              <Card
                padding={13}
                style={[
                  styles.row,
                  delinquent ? { backgroundColor: "rgba(224,130,103,.07)", borderColor: "rgba(224,130,103,.34)" } : null,
                ]}
              >
                <Avatar name={member.name} uri={member.photoUrl} size={38} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {member.name}
                  </Text>
                  <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {member.planName ?? "Sin bono"} · {member.centerName}
                  </Text>
                </View>
                <Badge label={badge.label} tone={badge.tone} />
                <Icon name="chevron-right" size={15} color={theme.textFaint} />
              </Card>
              </Pressable>
            </FadeInUp>
          );
        })
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 11 },
});
