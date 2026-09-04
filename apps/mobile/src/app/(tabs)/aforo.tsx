import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { goBack } from "@/utils/navigation";
import { useCenterCapacity, useUpdateCapacity } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { Stepper } from "@/components/Stepper";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { CapacitySession } from "@/api/types";

/**
 * «Aforo de clases» (Entrenador Admin y dirección).
 *
 * La web ajusta el aforo POR DEFECTO del centro —con qué nace una sesión
 * nueva—, y eso sigue aquí abajo. Pero en la sala la pregunta es otra: ¿puedo
 * meter a uno más en la clase de las 19:00 de HOY? Por eso lo primero de la
 * pantalla son las clases del día con su ocupación y su `Stepper`.
 *
 * El servidor no deja bajar el aforo por debajo de la ocupación: dejaría fuera
 * a socios que siguen apuntados. La app refleja ese tope en el propio `min` del
 * contador, para que el error no llegue a producirse.
 */
export default function CapacityScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading, isError, refetch, isRefetching } = useCenterCapacity();
  const updateCapacity = useUpdateCapacity();

  async function setSessionCapacity(session: CapacitySession, capacity: number) {
    try {
      await updateCapacity.mutateAsync({ sessionId: session.id, capacity });
      toast.show(`${session.name}: ${capacity} plazas.`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo cambiar el aforo.", "critical");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="AFORO DEL CENTRO"
          title="Aforo de clases"
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
        <SkeletonList rows={4} shape="row" note="Cargando el aforo de hoy…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar el aforo" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <SectionTitle label="Aforo de hoy" />
          {data.sessions.length === 0 ? (
            <EmptyState icon="calendar" title="Sin clases de grupo hoy" description="El aforo por defecto sigue abajo." />
          ) : (
            data.sessions.map((session, index) => (
              <FadeInUp key={`${session.id}-${session.occurrenceDate}`} delay={stagger(index)}>
                <Card style={{ gap: 12 }}>
                  <View style={styles.sessionHeader}>
                    <Text style={[styles.time, { color: theme.textSecondary }]}>{session.startTime}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                        {session.name}
                      </Text>
                      <Text
                        style={[typo.rowMeta, { color: session.full && session.waiting > 0 ? theme.critical : theme.textMuted }]}
                        numberOfLines={1}
                      >
                        {session.booked} de {session.capacity}
                        {session.waiting > 0 ? ` · ${session.waiting} en espera` : ""}
                      </Text>
                    </View>
                    {session.full ? <Badge label="Completa" tone={session.waiting > 0 ? "critical" : "warning"} /> : null}
                  </View>

                  <Stepper
                    value={session.capacity}
                    // El suelo es la ocupación real: por debajo, alguien ya
                    // inscrito se quedaría fuera de su propia sesión.
                    min={Math.max(1, session.booked)}
                    max={data.maxCapacity}
                    onChange={(value) => setSessionCapacity(session, value)}
                  />
                </Card>
              </FadeInUp>
            ))
          )}

          <SectionTitle label="Aforo por defecto" />
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
            Plazas con las que nace una sesión de grupo nueva. Cambiarlo no toca las sesiones ya creadas: cada una conserva
            el aforo con el que se creó.
          </Text>
          {data.centers.map((center) => (
            <Card key={center.id} style={{ gap: 12 }}>
              <Text style={[typo.cardTitleSmall, { color: theme.text }]}>{center.name}</Text>
              <Stepper
                value={center.defaultGroupCapacity ?? 6}
                min={1}
                max={data.maxCapacity}
                onChange={(value) =>
                  updateCapacity
                    .mutateAsync({ centerId: center.id, defaultGroupCapacity: value })
                    .then(() => toast.show(`Aforo por defecto de ${center.name}: ${value}.`))
                    .catch((err: unknown) =>
                      toast.show(err instanceof Error ? err.message : "No se pudo guardar.", "critical")
                    )
                }
              />
            </Card>
          ))}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sessionHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  time: { fontFamily: fonts.bold, fontSize: 12.5, width: 44, ...tabular },
});
