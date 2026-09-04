import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { canManageCenterCapacity, canManageLeads, hasTaskInbox, isTrainerRole } from "@/auth/routes";
import { useLeads, useMemberships, useNotifications, useTasks } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Icon, type IconName } from "@/components/Icon";
import { Divider, ListRow } from "@/components/Row";
import { ProgressRing } from "@/components/ProgressRing";
import { FadeInUp } from "@/components/FadeInUp";
import { formatDayMonth } from "@/utils/format";

/**
 * «Más»: la quinta pestaña de los dos roles. Sustituye a Perfil como índice.
 *
 * El cambio de nombre no es cosmético. Cuando la quinta pestaña se llamaba
 * «Perfil», todo lo que no cabía en las otras cuatro quedaba escondido detrás
 * de una palabra que promete otra cosa —los datos de tu cuenta—, así que
 * Tareas, Leads, Avisos o el calendario no se encontraban. Ahora la pestaña es
 * el índice, con CONTADORES de lo que tiene trabajo pendiente, y la cuenta baja
 * a una tarjeta al pie: se entra a ella una vez al mes, no cinco veces al día.
 */
export default function MoreScreen() {
  const { state } = useAuth();
  const user = state.status === "signedIn" ? state.user : null;
  if (!user) return null;
  // El socio tiene su propio índice (bono y consumos); todo el personal —no
  // solo el entrenador— comparte el del equipo.
  return user.role === "MEMBER" ? (
    <MemberMore name={user.name} email={user.email} image={user.image} />
  ) : (
    <StaffMore role={user.role} name={user.name} email={user.email} image={user.image} />
  );
}

// ---------- Entrenador ----------

function StaffMore({
  role,
  name,
  email,
  image,
}: {
  role: import("@/api/types").Role;
  name: string;
  email: string;
  image: string | null;
}) {
  const theme = useTheme();
  const tasks = useTasks("mine", { enabled: hasTaskInbox(role) });
  // Los leads solo se piden si el rol puede verlos: pedirlos igualmente
  // devolvería un 403 y dejaría la pantalla en estado de error por un tile que
  // ni siquiera se enseña.
  const leads = useLeads(null, "", { enabled: canManageLeads(role) });
  const notifications = useNotifications();
  const refreshing = tasks.isRefetching || leads.isRefetching || notifications.isRefetching;

  const pendingTasks = tasks.data?.counts.todo ?? 0;
  const uncontactedLeads = leads.data?.counts.SIN_CONTACTAR ?? 0;
  const unread = (notifications.data?.notifications ?? []).filter((n) => !n.resolvedAt && n.kind !== "TASK").length;

  const tiles: TileProps[] = [
    ...(hasTaskInbox(role)
      ? [{ icon: "clipboard" as IconName, label: "Tareas", href: "/tareas", count: pendingTasks, tone: "warning" as const }]
      : []),
    ...(canManageLeads(role)
      ? [{ icon: "users" as IconName, label: "Leads", href: "/leads", count: uncontactedLeads, tone: "gold" as const }]
      : []),
    ...(isTrainerRole(role) ? [{ icon: "star" as IconName, label: "Session Brief", href: "/brief" }] : []),
    ...(canManageCenterCapacity(role)
      ? [{ icon: "grid" as IconName, label: "Aforo de clases", href: "/aforo", badge: "Admin" }]
      : []),
  ];

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            tasks.refetch();
            leads.refetch();
            notifications.refetch();
          }}
          tintColor={theme.gold}
        />
      }
    >
      <FadeInUp>
        <ScreenHeader kicker="EL RESTO DE LA APP" title="Más" tight />
      </FadeInUp>

      <FadeInUp delay={stagger(1)}>
        <View style={styles.tileGrid}>
          {tiles.map((tile) => (
            <Tile key={tile.href} {...tile} />
          ))}
        </View>
      </FadeInUp>

      <SectionTitle label="Consulta" />
      <FadeInUp delay={stagger(2)}>
        <Card tone="alt" padding={0} style={{ gap: 0 }}>
          <View style={styles.listInset}>
            <ListRow
              title="Avisos"
              meta="Lo que hay que resolver, con su acción"
              chevron
              right={unread > 0 ? <Badge label={`${unread}`} tone="critical" /> : undefined}
              onPress={() => router.push("/notificaciones")}
            />
            {isTrainerRole(role) ? (
              <>
                <Divider />
                <ListRow
                  title="Mis horas y adherencia"
                  meta="Lo que llevas del mes y de tus clientes"
                  chevron
                  onPress={() => router.push("/panel")}
                />
                <Divider />
                <ListRow
                  title="Mis socios"
                  meta="Adherencia, aptitud y ficha de cada uno"
                  chevron
                  onPress={() => router.push("/mis-socios")}
                />
              </>
            ) : null}
          </View>
        </Card>
      </FadeInUp>

      <AccountCard name={name} email={email} image={image} />
    </ScreenContainer>
  );
}

// ---------- Socio ----------

function MemberMore({ name, email, image }: { name: string; email: string; image: string | null }) {
  const theme = useTheme();
  const memberships = useMemberships();
  const notifications = useNotifications();
  const unread = (notifications.data?.notifications ?? []).filter((n) => !n.resolvedAt).length;

  // El bono que manda en la tarjeta es el numerado: es el que se agota y el
  // único sobre el que hay una decisión que tomar (ampliar). Un ilimitado no
  // necesita anillo.
  const memberships_ = memberships.data?.memberships ?? [];
  const bono = memberships_.find((m) => !m.unlimited) ?? memberships_[0];
  const pct = bono && bono.total ? Math.round(((bono.remaining ?? 0) / bono.total) * 100) : 0;

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={memberships.isRefetching}
          onRefresh={() => {
            memberships.refetch();
            notifications.refetch();
          }}
          tintColor={theme.gold}
        />
      }
    >
      <FadeInUp>
        <ScreenHeader kicker="TU CUENTA Y TU BONO" title="Más" tight />
      </FadeInUp>

      {bono ? (
        <FadeInUp delay={stagger(1)}>
          <Card style={styles.bonoCard}>
            <View style={styles.bonoTop}>
              <ProgressRing progressPct={pct} size={88} strokeWidth={6} onInk={false}>
                {bono.unlimited ? (
                  <Text style={[styles.bonoValue, { color: theme.good }]}>∞</Text>
                ) : (
                  <>
                    <Text style={[styles.bonoValue, { color: theme.text }]}>{bono.remaining ?? 0}</Text>
                    <Text style={[typo.legend, { color: theme.textMuted }]}>DE {bono.total ?? 0}</Text>
                  </>
                )}
              </ProgressRing>
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={[typo.cardTitle, { color: theme.text }]} numberOfLines={2}>
                  {bono.planName}
                </Text>
                <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={2}>
                  {bono.renewsAt ? `Renueva el ${formatDayMonth(bono.renewsAt)}` : "Sin vencimiento"} · {bono.centerName}
                </Text>
                <View style={styles.badgeRow}>
                  <Badge label={bono.status === "ACTIVE" ? "Activo" : "Congelado"} tone={bono.status === "ACTIVE" ? "good" : "warning"} />
                  {bono.isRecurring ? <Badge label="Renovación automática" tone="gold" /> : null}
                </View>
              </View>
            </View>
            <View style={styles.bonoActions}>
              <Button title="Ver consumo" variant="outline" size="sm" style={{ flex: 1 }} onPress={() => router.push("/consumo")} />
              <Button title="Ampliar" variant="gold" size="sm" style={{ flex: 1 }} onPress={() => router.push("/onboarding/planes")} />
            </View>
          </Card>
        </FadeInUp>
      ) : null}

      <FadeInUp delay={stagger(2)}>
        <Card tone="alt" padding={0} style={{ gap: 0 }}>
          <View style={styles.listInset}>
            <ListRow
              title="Avisos y anuncios"
              meta="Tus sesiones y las novedades del centro"
              chevron
              right={unread > 0 ? <Badge label={`${unread}`} tone="critical" /> : undefined}
              onPress={() => router.push("/notificaciones")}
            />
            <Divider />
            <ListRow
              title="Historial de consumo"
              meta="Cada sesión gastada y cada devolución"
              chevron
              onPress={() => router.push("/consumo")}
            />
            <Divider />
            <ListRow title="Mis bonos" meta="Todos tus bonos y su estado" chevron onPress={() => router.push("/bonos")} />
            <Divider />
            {/* La fila se llamaba «Salud y consentimientos» pero abre «Mi
                evolución»: quien buscaba lo que tenía firmado no lo encontraba
                y quien quería ver su progreso no entraba aquí. */}
            <ListRow
              title="Mi evolución"
              meta="Tus medidas, tu progreso y el consentimiento que lo permite"
              chevron
              onPress={() => router.push("/evolucion")}
            />
          </View>
        </Card>
      </FadeInUp>

      <AccountCard name={name} email={email} image={image} />
    </ScreenContainer>
  );
}

// ---------- Piezas comunes ----------

type TileProps = {
  icon: IconName;
  label: string;
  href: string;
  count?: number;
  tone?: "warning" | "gold";
  badge?: string;
};

/** Tile de la rejilla 2×2: icono arriba, contador arriba a la derecha. */
function Tile({ icon, label, href, count, tone, badge }: TileProps) {
  const theme = useTheme();
  const countColor = tone === "warning" ? theme.warning : theme.gold;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} pendientes` : label}
      onPress={() => router.push(href)}
      style={[styles.tile, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={styles.tileTop}>
        <Icon name={icon} size={21} color={theme.text} />
        {count ? (
          <View style={[styles.tileCount, { backgroundColor: countColor }]}>
            <Text style={[styles.tileCountText, { color: theme.inkText }]}>{count > 9 ? "9+" : count}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[typo.cardTitleSmall, { color: theme.text }]} numberOfLines={2}>
        {label}
      </Text>
      {badge ? <Badge label={badge} tone="gold" /> : null}
    </Pressable>
  );
}

/** Ficha de cuenta al pie: se entra una vez al mes, no cinco veces al día. */
function AccountCard({ name, email, image }: { name: string; email: string; image: string | null }) {
  return (
    <FadeInUp delay={stagger(4)}>
      <Card>
        <ListRow
          left={<Avatar name={name} uri={image} size={46} />}
          title={name}
          meta={email}
          chevron
          onPress={() => router.push("/perfil")}
          accessibilityLabel="Abrir mi cuenta"
        />
      </Card>
    </FadeInUp>
  );
}

const styles = StyleSheet.create({
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 104,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    justifyContent: "space-between",
    gap: 10,
  },
  tileTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  tileCount: { minWidth: 20, height: 20, borderRadius: 999, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" },
  tileCountText: { fontFamily: fonts.bold, fontSize: 10.5, ...tabular },
  listInset: { paddingHorizontal: 14 },
  bonoCard: { gap: 14 },
  bonoTop: { flexDirection: "row", alignItems: "center", gap: 16 },
  bonoValue: { fontFamily: fonts.bold, fontSize: 22, ...tabular },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  bonoActions: { flexDirection: "row", gap: 8 },
});
