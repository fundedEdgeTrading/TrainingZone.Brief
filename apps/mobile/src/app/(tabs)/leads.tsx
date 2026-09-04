import { useState } from "react";
import { Linking, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useLeads, useUpdateLead } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { LeadItem, LeadStage } from "@/api/types";

/**
 * Embudo comercial (F8) en el móvil. Se enseña la fila de cuatro contadores y,
 * de cada lead, solo lo que hace falta para el gesto que se hace de pie: llamar
 * y agendar la prueba.
 *
 * Lo que NO está aquí, a propósito: dar de alta un lead (formulario largo con
 * CP, ocupación y salud) y cerrarlo con cobro. Ambos siguen en la web. Meter
 * medio formulario en el móvil produce leads incompletos, que es peor que no
 * tener el alta.
 */
const STAGES: { value: LeadStage; label: string }[] = [
  { value: "SIN_CONTACTAR", label: "Nuevos" },
  { value: "SEGUIMIENTO", label: "Contactados" },
  { value: "CON_FECHA_VALORACION", label: "Prueba" },
  { value: "CERRADO", label: "Alta" },
];

const STAGE_TONE: Record<LeadStage, "critical" | "warning" | "gold" | "good" | "neutral"> = {
  SIN_CONTACTAR: "critical",
  SEGUIMIENTO: "warning",
  CON_FECHA_VALORACION: "gold",
  CERRADO: "good",
  NO_CERRADO: "neutral",
};

export default function LeadsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const [stage, setStage] = useState<LeadStage | null>(null);
  const { data, isLoading, isError, refetch, isRefetching } = useLeads(stage);
  const updateLead = useUpdateLead();

  async function call(lead: LeadItem) {
    // Registrar el contacto va unido a llamar: si fueran dos gestos, el segundo
    // no se hace nunca y el embudo deja de reflejar la realidad. RB-LEAD-003:
    // quien llama se lleva el lead si no tenía responsable.
    // Los dos fallos posibles son distintos y el aviso tiene que decir cuál
    // fue: con un único `catch`, un error al guardar el cambio de etapa
    // avisaba de que «no se pudo abrir el marcador» después de haber llamado.
    try {
      await Linking.openURL(`tel:${lead.phone.replace(/\s+/g, "")}`);
    } catch {
      toast.show("No se pudo abrir el marcador del teléfono.", "critical");
      return;
    }

    if (lead.status !== "SIN_CONTACTAR") return;
    try {
      await updateLead.mutateAsync({ id: lead.id, status: "SEGUIMIENTO", claimOwner: true });
      toast.show("Contacto registrado: pasa a seguimiento.");
    } catch (err) {
      toast.show(
        err instanceof Error ? err.message : "Llamada hecha, pero no se pudo registrar el contacto.",
        "critical"
      );
    }
  }

  async function scheduleTrial(lead: LeadItem) {
    try {
      await updateLead.mutateAsync({ id: lead.id, status: "CON_FECHA_VALORACION", claimOwner: true });
      toast.show("Marcado con fecha de valoración. Crea la sesión en la agenda.");
      router.push("/staff-agenda");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo mover el lead.", "critical");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="EMBUDO COMERCIAL"
          title="Leads"
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

      <FadeInUp delay={stagger(1)}>
        <View style={styles.funnel}>
          {STAGES.map((item) => {
            const active = stage === item.value;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setStage(active ? null : item.value)}
                style={[
                  styles.funnelTile,
                  { backgroundColor: theme.surface, borderColor: active ? theme.gold : theme.border },
                ]}
              >
                <Text style={[styles.funnelValue, { color: active ? theme.goldText : theme.text }]}>
                  {data?.counts[item.value as keyof typeof data.counts] ?? 0}
                </Text>
                <Text style={[typo.kpiLabel, { color: theme.textMuted }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} shape="avatarRow" note="Cargando el embudo…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar los leads" description="Desliza hacia abajo para reintentar." />
      ) : data.leads.length === 0 ? (
        <EmptyState icon="users" title="Sin leads en esta etapa" description="Los que entren por la web aparecerán aquí." />
      ) : (
        data.leads.map((lead, index) => (
          <FadeInUp key={lead.id} delay={stagger(index)}>
            <Card style={{ gap: 12 }}>
              <View style={styles.leadHeader}>
                <Avatar name={lead.name} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typo.rowTitle, { color: theme.text }]} numberOfLines={1}>
                    {lead.name}
                  </Text>
                  <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                    {lead.channel} · {ageOf(lead.createdAt)}
                  </Text>
                </View>
                <Badge label={labelFor(lead.status)} tone={STAGE_TONE[lead.status]} />
              </View>

              {lead.goals ? (
                <Text style={[typo.rowMeta, { color: theme.textSecondary }]} numberOfLines={2}>
                  {lead.goals}
                </Text>
              ) : null}

              {lead.status !== "CERRADO" ? (
                <View style={styles.leadActions}>
                  <Button title="Llamar" variant="gold" size="sm" icon="user" style={{ flex: 1 }} onPress={() => call(lead)} />
                  <Button
                    title="Agendar prueba"
                    variant="outline"
                    size="sm"
                    style={{ flex: 1 }}
                    loading={updateLead.isPending && updateLead.variables?.id === lead.id}
                    onPress={() => scheduleTrial(lead)}
                  />
                </View>
              ) : null}
            </Card>
          </FadeInUp>
        ))
      )}
    </ScreenContainer>
  );
}

function labelFor(status: LeadStage): string {
  return STAGES.find((s) => s.value === status)?.label ?? "Archivado";
}

/** Antigüedad del lead: en comercial, un lead de hace tres días ya está frío. */
function ageOf(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 30) return `hace ${days} días`;
  return `hace ${Math.floor(days / 30)} meses`;
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  funnel: { flexDirection: "row", gap: 8 },
  funnelTile: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 9, gap: 3, alignItems: "center" },
  funnelValue: { fontFamily: fonts.bold, fontSize: 19, ...tabular },
  leadHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  leadActions: { flexDirection: "row", gap: 8 },
});
