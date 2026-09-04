import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { isTrainerRole, needsMembershipGate } from "@/auth/routes";
import { useNotifications, useTasks, useTrainerPanel } from "@/api/queries";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts } from "@/theme/typography";
import { Icon, type IconName } from "@/components/Icon";
import { PortalGate } from "@/components/PortalGate";
import type { Role } from "@/api/types";

/**
 * Navegación por rol. Rediseño: CINCO pestañas por rol elegidas por frecuencia
 * de uso, y una quinta —«Más»— que deja de ser Perfil y pasa a ser un índice
 * real del resto de la app, con contadores.
 *
 * Lo que cambia respecto a la versión anterior y por qué:
 *
 * - El entrenador tenía en la app solo panel, agenda, feedback, brief y perfil,
 *   mientras en la web disponía además de Tareas, Socios, Leads y —como
 *   Entrenador Admin— Aforo. «Socios» sube a pestaña (es lo que más se consulta
 *   antes de una sesión) y el resto entra por «Más», que ahora los lista con su
 *   contador. Brief baja de pestaña: se llega a él desde la propia sesión, que
 *   es cuando hace falta.
 * - El socio tenía Calendario, Evolución y Avisos escondidos DENTRO de Perfil.
 *   Evolución sube a pestaña, Calendario se funde en «Sesiones» como vista
 *   (era una pantalla aparte que contaba lo mismo) y Avisos entra por la
 *   campana de Hoy y por «Más».
 *
 * Los tabs que no le tocan a un rol se ocultan con `href: null` (Expo Router),
 * no se desmontan: así el grupo (tabs) declara siempre las mismas pantallas y
 * las secundarias siguen siendo navegables por `push`.
 */
const TABS_BY_ROLE: Record<Role, string[]> = {
  MEMBER: ["index", "agenda", "sesiones", "evolucion", "mas"],
  TRAINER: ["panel", "staff-agenda", "mis-socios", "feedback", "mas"],
  // El Entrenador Admin ve lo mismo; lo que le distingue (aforo, ajuste de
  // saldo al descartar) aparece DENTRO de esas pantallas según su permiso, no
  // como una pestaña más: su día a día es el mismo que el del entrenador.
  TRAINER_ADMIN: ["panel", "staff-agenda", "mis-socios", "feedback", "mas"],
  OWNER: ["dashboard", "socios", "productos", "organizacion", "mas"],
  CENTER_DIRECTOR: ["dashboard", "socios", "staff-agenda", "productos", "mas"],
  PLATFORM_ADMIN: ["dashboard", "socios", "productos", "organizacion", "mas"],
  RECEPTION: ["socios", "staff-agenda", "notificaciones", "mas"],
  HR_MANAGER: ["organizacion", "notificaciones", "mas"],
};

/** Etiquetas por rol donde la misma pantalla se llama distinto a cada uno. */
const LABEL_OVERRIDES: Partial<Record<Role, Record<string, string>>> = {
  MEMBER: { index: "Hoy" },
  TRAINER: { panel: "Hoy" },
  TRAINER_ADMIN: { panel: "Hoy" },
};

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Actividad", icon: "activity" },
  agenda: { label: "Reservar", icon: "calendar" },
  sesiones: { label: "Sesiones", icon: "clock" },
  bonos: { label: "Bonos", icon: "wallet" },
  evolucion: { label: "Evolución", icon: "chart" },
  consumo: { label: "Consumo", icon: "wallet" },
  panel: { label: "Mi panel", icon: "activity" },
  brief: { label: "Brief", icon: "clipboard" },
  feedback: { label: "Feedback", icon: "star" },
  "staff-agenda": { label: "Agenda", icon: "calendar" },
  "mis-socios": { label: "Socios", icon: "users" },
  tareas: { label: "Tareas", icon: "clipboard" },
  leads: { label: "Leads", icon: "users" },
  aforo: { label: "Aforo", icon: "grid" },
  dashboard: { label: "Panel", icon: "chart" },
  socios: { label: "Socios", icon: "users" },
  productos: { label: "Productos", icon: "box" },
  anuncios: { label: "Anuncios", icon: "bell" },
  organizacion: { label: "Equipo", icon: "building" },
  notificaciones: { label: "Avisos", icon: "bell" },
  mas: { label: "Más", icon: "grid" },
  perfil: { label: "Perfil", icon: "user" },
};

const ALL_TABS = Object.keys(TAB_META);

export default function TabsLayout() {
  const { state } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const role = state.status === "signedIn" ? state.user.role : null;
  const isTrainer = role ? isTrainerRole(role) : false;

  // Contadores de las pestañas. Se piden aquí porque la barra los enseña
  // siempre, y TanStack Query comparte la caché con la pantalla que los usa:
  // abrir Feedback no vuelve a pedir lo mismo.
  const panel = useTrainerPanel(undefined, { enabled: isTrainer });
  const tasks = useTasks("mine", { enabled: Boolean(role) && role !== "MEMBER" });
  const notifications = useNotifications({ enabled: Boolean(role) });

  const pendingFeedback = panel.data?.pendingDebriefs.length ?? 0;
  const unreadNotices = (notifications.data?.notifications ?? []).filter((n) => !n.resolvedAt && n.kind !== "TASK").length;
  const overdueTasks = tasks.data?.counts.todo ?? 0;
  const moreCount = unreadNotices + (role === "MEMBER" ? 0 : overdueTasks);

  if (state.status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.gold} />
      </View>
    );
  }
  if (state.status === "signedOut") return <Redirect href="/login" />;
  // Gate de compra (A2): sin bono vivo, el socio no entra al portal.
  if (needsMembershipGate(state.user)) return <Redirect href="/onboarding/planes" />;

  const visible = new Set(TABS_BY_ROLE[state.user.role] ?? []);
  const overrides = LABEL_OVERRIDES[state.user.role] ?? {};
  const badgeFor = (name: string) =>
    name === "feedback" ? pendingFeedback : name === "mas" ? moreCount : 0;

  return (
    <>
      <PortalGate isMember={state.user.role === "MEMBER"} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.gold,
          tabBarInactiveTintColor: theme.textFaint,
          // La barra flota sobre el contenido (ScreenContainer le deja hueco).
          tabBarStyle: {
            position: "absolute",
            left: 12,
            right: 12,
            bottom: insets.bottom > 0 ? insets.bottom - 4 : 10,
            height: layout.tabBarHeight,
            paddingTop: 10,
            paddingBottom: 12,
            borderRadius: radii.hero,
            borderTopWidth: 0,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.sheet,
            shadowColor: theme.shadowColor,
            shadowOpacity: 1,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 10 },
            elevation: 8,
          },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 9.5, letterSpacing: 0.3 },
          tabBarItemStyle: { paddingVertical: 2 },
        }}
      >
        {ALL_TABS.map((name) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: overrides[name] ?? TAB_META[name].label,
              href: visible.has(name) ? undefined : null,
              tabBarIcon: ({ color, focused }) => (
                <View style={styles.iconWrapper}>
                  <Icon name={TAB_META[name].icon} size={19} color={color as string} strokeWidth={focused ? 2 : 1.6} />
                  <TabBadge count={badgeFor(name)} />
                </View>
              ),
            }}
          />
        ))}
      </Tabs>
    </>
  );
}

/**
 * Contador sobre el icono. Lo que cuenta es trabajo pendiente —sesiones sin
 * feedback, tareas por hacer, avisos sin leer— nunca novedades decorativas: un
 * punto rojo que no se puede vaciar deja de significar nada.
 */
function TabBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.gold }]}>
      <Text style={[styles.badgeText, { color: theme.inkText }]} numberOfLines={1}>
        {count > 9 ? "9+" : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconWrapper: { alignItems: "center", justifyContent: "center", height: 22 },
  badge: {
    position: "absolute",
    top: -5,
    right: -11,
    minWidth: 15,
    height: 15,
    borderRadius: 999,
    paddingHorizontal: 3.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, lineHeight: 12 },
});
