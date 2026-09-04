import { useMemo, useState } from "react";
import { RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useTrainerMembers } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Avatar } from "@/components/Avatar";
import { Chip, ChipRow } from "@/components/Chip";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Divider, ListRow } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import type { TrainerMemberFilter, TrainerMemberRow } from "@/api/types";

/**
 * Socios del entrenador. NO es el listado de gestión de dirección: aquí no hay
 * estado de cobro ni bajas, porque un entrenador no decide sobre eso. Lo que
 * hay es a quién entrena, cómo va de adherencia y —arriba del todo— a quién
 * hay que adaptarle la sesión, que es lo único que no puede esperar.
 *
 * El bloque «Requieren adaptación» va SIEMPRE completo, sea cual sea el chip
 * elegido: filtrarlo escondería justamente lo que no se puede perder de vista.
 */
export default function TrainerMembersScreen() {
  const theme = useTheme();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TrainerMemberFilter>("all");
  const { data, isLoading, isError, refetch, isRefetching } = useTrainerMembers(filter, search);

  // Adherencia como color: verde ≥ 85, ámbar < 70. Es la lectura que hace el
  // entrenador de un vistazo, y una cifra suelta no la da.
  const toneFor = (pct: number) => (pct >= 85 ? theme.good : pct < 70 ? theme.warning : theme.text);

  const alphabetical = useMemo(
    () => [...(data?.members ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [data]
  );

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      {/* Cabecera, buscador y filtros son REALES desde el primer fotograma:
          solo se esqueletizan las filas, para que nada salte al llegar los datos. */}
      <FadeInUp>
        <ScreenHeader kicker="TU GENTE" title="Socios" tight />
      </FadeInUp>

      <Field
        placeholder="Buscar por nombre"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
        right={<Icon name="search" size={17} color={theme.textFaint} />}
      />

      <ChipRow>
        <Chip label={`Todos${data ? ` · ${data.counts.all}` : ""}`} selected={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label={`Mis EP${data ? ` · ${data.counts.ep}` : ""}`} selected={filter === "ep"} onPress={() => setFilter("ep")} />
        <Chip label={`Grupos${data ? ` · ${data.counts.group}` : ""}`} selected={filter === "group"} onPress={() => setFilter("group")} />
        <Chip
          label={`Alertas${data ? ` · ${data.counts.alerts}` : ""}`}
          tone="critical"
          selected={filter === "alerts"}
          onPress={() => setFilter("alerts")}
        />
      </ChipRow>

      {isLoading ? (
        <SkeletonList rows={5} shape="avatarRow" note="Cargando tus socios…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar tus socios" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {data.needAdaptation.length > 0 ? (
            <>
              <SectionTitle label="Requieren adaptación" />
              <FadeInUp delay={stagger(1)}>
                <Card style={{ gap: 12 }}>
                  {data.needAdaptation.map((member) => (
                    <ListRow
                      key={member.id}
                      left={<Avatar name={member.name} uri={member.photoUrl} size={34} />}
                      title={member.name}
                      meta={[member.condition, member.nextLabel].filter(Boolean).join(" · ")}
                      right={
                        <Badge
                          label={member.light === "RED" ? "Evitar" : "Adaptar"}
                          tone={member.light === "RED" ? "critical" : "warning"}
                        />
                      }
                      onPress={() => router.push(`/mis-socios/${member.id}`)}
                    />
                  ))}
                </Card>
              </FadeInUp>
            </>
          ) : null}

          <SectionTitle label={filter === "alerts" ? "Con alerta de aptitud" : "Todos tus socios"} />
          {alphabetical.length === 0 ? (
            <EmptyState
              icon="users"
              title="Sin socios en este filtro"
              description="Aparecen aquí en cuanto les des —o tengas agendada— una sesión."
            />
          ) : (
            <FadeInUp delay={stagger(2)}>
              <Card tone="alt" padding={0} style={{ gap: 0 }}>
                {alphabetical.map((member, index) => (
                  <View key={member.id} style={styles.listInset}>
                    {index > 0 ? <Divider /> : null}
                    <MemberRow member={member} tone={toneFor(member.adherencePct)} />
                  </View>
                ))}
              </Card>
            </FadeInUp>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function MemberRow({ member, tone }: { member: TrainerMemberRow; tone: string }) {
  const theme = useTheme();
  return (
    <ListRow
      left={
        <View>
          <Avatar name={member.name} uri={member.photoUrl} size={34} />
          {member.light && member.light !== "GREEN" ? (
            <View
              style={[
                styles.lightDot,
                { backgroundColor: member.light === "RED" ? theme.critical : theme.warning, borderColor: theme.sheet },
              ]}
            />
          ) : null}
        </View>
      }
      title={member.name}
      meta={[member.kinds.includes("EP") ? "EP" : null, member.kinds.includes("GROUP") ? "Grupos" : null, member.nextLabel]
        .filter(Boolean)
        .join(" · ")}
      right={<Text style={[styles.adherence, { color: tone }]}>{member.adherencePct}%</Text>}
      chevron
      onPress={() => router.push(`/mis-socios/${member.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  listInset: { paddingHorizontal: 14 },
  adherence: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
  lightDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: radii.pill,
    borderWidth: 2,
  },
});
