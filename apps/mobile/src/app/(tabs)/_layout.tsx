import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { hasTaskInbox, isTrainerRole, needsMembershipGate, tabsFor, type TabName } from "@/auth/routes";
import { useNotifications, useTasks, useTrainerPanel } from "@/api/queries";
import { useTheme, layout } from "@/theme/theme";
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
 * El reparto vive en `@/auth/routes` (`TABS_BY_ROLE`) junto a la ruta de
 * aterrizaje de cada rol, que es su PRIMERA pestaña: separados, el login
 * mandaba a todo el mundo a `/(tabs)` —o sea, al «Hoy» del socio— y quien no
 * era socio se estrellaba contra el 403 de `/portal/*`.
 *
 * Los tabs que no le tocan a un rol se ocultan con `href: null` (Expo Router),
 * no se desmontan: así el grupo (tabs) declara siempre las mismas pantallas y
 * las secundarias siguen siendo navegables por `push`.
 */

/** Etiquetas por rol donde la misma pantalla se llama distinto a cada uno. */
const LABEL_OVERRIDES: Partial<Record<Role, Partial<Record<TabName, string>>>> = {
  MEMBER: { index: "Hoy" },
  TRAINER: { panel: "Hoy" },
  TRAINER_ADMIN: { panel: "Hoy" },
};

/** Rótulo e icono de cada pestaña. Tipado por `TabName`: una pestaña nueva sin entrada aquí no compila. */
const TAB_META: Record<TabName, { label: string; icon: IconName }> = {
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

const ALL_TABS = Object.keys(TAB_META) as TabName[];

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
  const tasks = useTasks("mine", { enabled: role ? hasTaskInbox(role) : false });
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

  // `tabsFor` deja al menos «Más» a un rol sin pestañas declaradas: sin eso la
  // barra saldría vacía y el usuario se quedaría dentro de la app sin ninguna
  // forma de moverse ni de salir.
  const visible = new Set<TabName>(tabsFor(state.user.role));
  const overrides = LABEL_OVERRIDES[state.user.role] ?? {};
  const badgeFor = (name: TabName) =>
    name === "feedback" ? pendingFeedback : name === "mas" ? moreCount : 0;

  return (
    <>
      <PortalGate isMember={state.user.role === "MEMBER"} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.gold,
          tabBarInactiveTintColor: theme.textFaint,
          // La barra va FIJADA al borde inferior, a todo el ancho y sin margen
          // por debajo: antes flotaba con 12 px a los lados y un hueco variable
          // abajo (`insets.bottom - 4`), que en los móviles sin barra de gestos
          // dejaba la isla despegada del borde y en los que sí la tienen la
          // montaba encima del indicador. Al no ser `position: "absolute"`, el
          // navegador le resta su alto a la pantalla, así que ningún contenido
          // queda debajo de ella (ScreenContainer ya no reserva hueco).
          //
          // El área segura la absorbe la propia barra como `paddingBottom`: el
          // fondo llega hasta el borde físico y las etiquetas se quedan por
          // encima del indicador de gestos.
          tabBarStyle: {
            height: layout.tabBarHeight + insets.bottom,
            paddingTop: 7,
            paddingBottom: insets.bottom + 7,
            paddingHorizontal: 4,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.border,
            backgroundColor: theme.sheet,
            // Sin sombra ni elevación: pegada al borde no flota sobre nada, y
            // la sombra solo pintaba una banda sucia sobre el contenido.
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 9.5, letterSpacing: 0.3 },
          // Con el teclado abierto la barra taparía el campo que se está
          // escribiendo (buscadores de socios, notas del feedback).
          tabBarHideOnKeyboard: true,
        }}
      >
        {ALL_TABS.map((name) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: overrides[name] ?? TAB_META[name].label,
              href: visible.has(name) ? undefined : null,
              // `tabBarItemStyle` va aquí y no en `screenOptions` a propósito:
              // Expo Router reescribe esta opción por pantalla para ocultar las
              // que no tocan (`href: null`), y al hacerlo pisa con `undefined`
              // lo que hubiera puesto `screenOptions`.
              tabBarItemStyle: visible.has(name) ? { paddingVertical: 0 } : undefined,
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
