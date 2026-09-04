import { useMemo } from "react";
import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useAuth } from "@/auth/auth-context";
import { useMarkNotificationRead, useNotifications } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Icon, type IconName } from "@/components/Icon";
import { Divider, ListRow } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { formatShortDate } from "@/utils/format";
import type { NotificationItem } from "@/api/types";

/**
 * Avisos, rediseñados alrededor de una idea: cada aviso lleva LA ACCIÓN QUE LO
 * RESUELVE, no solo «marcar como leído».
 *
 * Antes, todos los avisos —una plaza que se ha liberado, un brief sin abrir, un
 * cobro fallido— terminaban en el mismo botón gris que solo los hacía
 * desaparecer. Un aviso que no se puede resolver desde donde se lee es un aviso
 * que se ignora, y una bandeja que se ignora deja de avisar de nada.
 *
 * Los leídos bajan a una lista compacta «Anteriores»: siguen consultables, pero
 * dejan de competir con lo que hay que hacer.
 */
type Resolution = { label: string; icon: IconName; accent: "gold" | "warning" | "critical" | "good"; go: () => void };

/**
 * Qué acción resuelve cada tipo de aviso. La entidad manda sobre el `kind`:
 * un aviso sobre una reserva se resuelve yendo a la reserva, venga de la regla
 * que venga.
 */
function resolutionFor(notification: NotificationItem, isMember: boolean): Resolution | null {
  const entity = notification.entityType;

  if (entity === "Booking" || entity === "ClassSession") {
    return isMember
      ? { label: "Ver sesión", icon: "clock", accent: "gold", go: () => router.push("/sesiones") }
      : { label: "Abrir brief", icon: "clipboard", accent: "gold", go: () => router.push("/panel") };
  }
  if (entity === "Subscription" || entity === "Payment") {
    return isMember
      ? { label: "Ver mi bono", icon: "wallet", accent: "warning", go: () => router.push("/consumo") }
      : null;
  }
  if (entity === "Lead") {
    return { label: "Abrir lead", icon: "users", accent: "gold", go: () => router.push("/leads") };
  }
  if (entity === "Member") {
    return isMember ? null : { label: "Ver socio", icon: "user", accent: "gold", go: () => router.push("/mis-socios") };
  }
  if (notification.kind === "TASK") {
    return { label: "Ver tarea", icon: "clipboard", accent: "warning", go: () => router.push("/tareas") };
  }
  return null;
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { state } = useAuth();
  const isMember = state.status === "signedIn" && state.user.role === "MEMBER";
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();

  const { open, read } = useMemo(() => {
    const all = data?.notifications ?? [];
    return { open: all.filter((n) => !n.resolvedAt), read: all.filter((n) => n.resolvedAt) };
  }, [data]);

  // Para el socio, los avisos se parten en dos: los que hablan de SUS sesiones
  // (accionables) y los del centro (informativos). Mezclados, los segundos
  // entierran a los primeros.
  const aboutSessions = open.filter((n) => n.entityType === "Booking" || n.entityType === "ClassSession");
  const fromCenter = open.filter((n) => !aboutSessions.includes(n));

  async function resolve(notification: NotificationItem) {
    try {
      await markRead.mutateAsync(notification.id);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo marcar el aviso.", "critical");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="BANDEJA"
          title="Avisos"
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
        <SkeletonList rows={4} shape="card" note="Cargando tus avisos…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar tus avisos" description="Desliza hacia abajo para reintentar." />
      ) : open.length === 0 && read.length === 0 ? (
        <EmptyState icon="check" title="Todo al día" description="No tienes avisos pendientes." />
      ) : (
        <>
          {isMember ? (
            <>
              {aboutSessions.length > 0 ? (
                <>
                  <SectionTitle label="Sobre tus sesiones" />
                  {aboutSessions.map((notification, index) => (
                    <FadeInUp key={notification.id} delay={stagger(index)}>
                      <NoticeCard
                        notification={notification}
                        resolution={resolutionFor(notification, isMember)}
                        onResolve={() => resolve(notification)}
                        busy={markRead.isPending && markRead.variables === notification.id}
                      />
                    </FadeInUp>
                  ))}
                </>
              ) : null}

              {fromCenter.length > 0 ? (
                <>
                  <SectionTitle label="Del centro" />
                  {fromCenter.map((notification, index) => (
                    <FadeInUp key={notification.id} delay={stagger(index)}>
                      <NoticeCard
                        notification={notification}
                        resolution={resolutionFor(notification, isMember)}
                        onResolve={() => resolve(notification)}
                        busy={markRead.isPending && markRead.variables === notification.id}
                      />
                    </FadeInUp>
                  ))}
                </>
              ) : null}
            </>
          ) : (
            <>
              {open.length > 0 ? <SectionTitle label="Por resolver" /> : null}
              {open.map((notification, index) => (
                <FadeInUp key={notification.id} delay={stagger(index)}>
                  <NoticeCard
                    notification={notification}
                    resolution={resolutionFor(notification, isMember)}
                    onResolve={() => resolve(notification)}
                    busy={markRead.isPending && markRead.variables === notification.id}
                  />
                </FadeInUp>
              ))}
              {open.length === 0 ? (
                <EmptyState icon="check" title="Nada por resolver" description="Los avisos nuevos aparecerán aquí." />
              ) : null}
            </>
          )}

          {read.length > 0 ? (
            <>
              <SectionTitle label="Anteriores" />
              <Card tone="alt" padding={0} style={{ gap: 0 }}>
                {read.slice(0, 20).map((notification, index) => (
                  <View key={notification.id} style={styles.listInset}>
                    {index > 0 ? <Divider /> : null}
                    <ListRow title={notification.title} meta={formatShortDate(notification.createdAt)} />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

function NoticeCard({
  notification,
  resolution,
  onResolve,
  busy,
}: {
  notification: NotificationItem;
  resolution: Resolution | null;
  onResolve: () => void;
  busy: boolean;
}) {
  const theme = useTheme();
  const accent =
    resolution?.accent === "critical"
      ? theme.critical
      : resolution?.accent === "warning"
        ? theme.warning
        : resolution?.accent === "good"
          ? theme.good
          : theme.gold;

  return (
    <Card padding={0} style={styles.noticeCard}>
      <View style={[styles.noticeBar, { backgroundColor: accent }]} />
      <View style={styles.noticeBody}>
        <View style={styles.noticeHeader}>
          <Icon name={resolution?.icon ?? "bell"} size={16} color={accent} />
          <Text style={[typo.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={2}>
            {notification.title}
          </Text>
        </View>
        {notification.body ? (
          <Text style={[styles.noticeText, { color: theme.textSecondary }]}>{notification.body}</Text>
        ) : null}
        <View style={styles.noticeFooter}>
          <Text style={[typo.rowMetaSmall, { color: theme.textFaint, flex: 1 }]}>{ageOf(notification.createdAt)}</Text>
          {/* La acción que lo resuelve va primero; «Hecho» es el remate, no el
              único botón. */}
          {resolution ? (
            <Button
              title={resolution.label}
              variant="gold"
              size="sm"
              onPress={() => {
                onResolve();
                resolution.go();
              }}
            />
          ) : null}
          <Button title="Hecho" variant="outline" size="sm" loading={busy} onPress={onResolve} />
        </View>
      </View>
    </Card>
  );
}

/** Antigüedad relativa: «hace 2 h» dice más que una fecha para un aviso vivo. */
function ageOf(iso: string): string {
  const minutes = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? "día" : "días"}`;
  return formatShortDate(iso);
}

const styles = StyleSheet.create({
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  noticeCard: { flexDirection: "row", overflow: "hidden" },
  noticeBar: { width: 3 },
  noticeBody: { flex: 1, padding: 15, gap: 9 },
  noticeHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  noticeText: { fontFamily: "Poppins_400Regular", fontSize: 11.5, lineHeight: 17 },
  noticeFooter: { flexDirection: "row", alignItems: "center", gap: 8 },
  listInset: { paddingHorizontal: 14 },
});
