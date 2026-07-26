import { ActivityIndicator, View, StyleSheet } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";

// Navegación por rol (F1 §5.6): esta primera versión solo cubre el portal del
// socio (NAV_BY_ROLE.MEMBER en src/lib/rbac.ts); el subconjunto de staff (F3)
// añadirá su propio shell más adelante.
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
      <Tabs.Screen name="index" options={{ title: "Actividad" }} />
      <Tabs.Screen name="agenda" options={{ title: "Reservar" }} />
      <Tabs.Screen name="notificaciones" options={{ title: "Avisos" }} />
      <Tabs.Screen name="perfil" options={{ title: "Perfil" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
