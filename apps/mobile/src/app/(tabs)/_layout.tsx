import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";
import type { Role } from "@/api/types";

// Navegación por rol (F1 §5.6 → F3): cada rol ve solo su subconjunto de tabs,
// espejo de NAV_BY_ROLE en src/lib/rbac.ts. Los tabs que no le tocan a un rol
// se ocultan con `href: null` (Expo Router), no se desmontan del todo: así el
// grupo (tabs) puede declarar siempre las mismas pantallas.
const TABS_BY_ROLE: Record<Role, string[]> = {
  MEMBER: ["index", "agenda", "evolucion", "notificaciones", "perfil"],
  TRAINER: ["panel", "brief", "staff-agenda", "notificaciones", "perfil"],
  OWNER: ["dashboard", "anuncios", "staff-agenda", "organizacion", "notificaciones", "perfil"],
  CENTER_DIRECTOR: ["dashboard", "anuncios", "staff-agenda", "notificaciones", "perfil"],
  PLATFORM_ADMIN: ["dashboard", "anuncios", "organizacion", "notificaciones", "perfil"],
  RECEPTION: ["notificaciones", "perfil"],
  HR_MANAGER: ["notificaciones", "perfil"],
};

const TAB_LABELS: Record<string, string> = {
  index: "Actividad",
  agenda: "Reservar",
  evolucion: "Evolución",
  panel: "Mi panel",
  brief: "Brief",
  "staff-agenda": "Agenda",
  dashboard: "Panel",
  anuncios: "Anuncios",
  organizacion: "Organización",
  notificaciones: "Avisos",
  perfil: "Perfil",
};

const ALL_TABS = Object.keys(TAB_LABELS);

export default function TabsLayout() {
  const { state } = useAuth();
  const theme = useTheme();

  if (state.status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }
  if (state.status === "signedOut") return <Redirect href="/login" />;

  const visible = new Set(TABS_BY_ROLE[state.user.role] ?? []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarLabelStyle: { fontFamily: "Poppins_600SemiBold", fontSize: 11 },
      }}
    >
      {ALL_TABS.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ title: TAB_LABELS[name], href: visible.has(name) ? undefined : null }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
