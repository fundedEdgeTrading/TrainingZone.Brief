import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { needsMembershipGate } from "@/auth/routes";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts } from "@/theme/typography";
import { Icon, type IconName } from "@/components/Icon";
import type { Role } from "@/api/types";

// Navegación por rol (F1 §5.6 → F3): cada rol ve solo su subconjunto de tabs,
// espejo de NAV_BY_ROLE en src/lib/rbac.ts. Los tabs que no le tocan a un rol
// se ocultan con `href: null` (Expo Router), no se desmontan del todo: así el
// grupo (tabs) puede declarar siempre las mismas pantallas.
//
// El handoff añade al socio "Mis sesiones", "Mis bonos" y su calendario; al
// entrenador el feedback 1-10; y a dirección socios y productos. Cinco tabs
// como máximo por rol: las pantallas secundarias (calendario, evolución,
// anuncios, avisos, agenda del centro) se abren desde Perfil, que actúa de
// índice del resto de la app.
const TABS_BY_ROLE: Record<Role, string[]> = {
  MEMBER: ["index", "agenda", "sesiones", "bonos", "perfil"],
  TRAINER: ["panel", "staff-agenda", "feedback", "brief", "perfil"],
  OWNER: ["dashboard", "socios", "productos", "organizacion", "perfil"],
  CENTER_DIRECTOR: ["dashboard", "socios", "staff-agenda", "productos", "perfil"],
  PLATFORM_ADMIN: ["dashboard", "socios", "productos", "organizacion", "perfil"],
  RECEPTION: ["socios", "staff-agenda", "notificaciones", "perfil"],
  HR_MANAGER: ["organizacion", "notificaciones", "perfil"],
};

const TAB_META: Record<string, { label: string; icon: IconName }> = {
  index: { label: "Actividad", icon: "activity" },
  agenda: { label: "Reservar", icon: "calendar" },
  sesiones: { label: "Sesiones", icon: "clock" },
  bonos: { label: "Bonos", icon: "wallet" },
  calendario: { label: "Calendario", icon: "grid" },
  evolucion: { label: "Evolución", icon: "chart" },
  panel: { label: "Mi panel", icon: "activity" },
  brief: { label: "Brief", icon: "clipboard" },
  feedback: { label: "Feedback", icon: "star" },
  "staff-agenda": { label: "Agenda", icon: "calendar" },
  dashboard: { label: "Panel", icon: "chart" },
  socios: { label: "Socios", icon: "users" },
  productos: { label: "Productos", icon: "box" },
  anuncios: { label: "Anuncios", icon: "bell" },
  organizacion: { label: "Equipo", icon: "building" },
  notificaciones: { label: "Avisos", icon: "bell" },
  perfil: { label: "Perfil", icon: "user" },
};

const ALL_TABS = Object.keys(TAB_META);

export default function TabsLayout() {
  const { state } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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

  return (
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
            title: TAB_META[name].label,
            href: visible.has(name) ? undefined : null,
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconWrapper}>
                <Icon name={TAB_META[name].icon} size={19} color={color as string} strokeWidth={focused ? 2 : 1.6} />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconWrapper: { alignItems: "center", justifyContent: "center", height: 22 },
});
