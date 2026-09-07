import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { homeRouteFor } from "@/auth/routes";
import { useTheme } from "@/theme/theme";
import { Button } from "@/components/Button";

// Splash/auto-login (F1 §5.4): mientras se resuelve el refresh token guardado
// en SecureStore, muestra un loader; después reparte a login, al catálogo de
// bonos (socio sin membresía viva) o al shell de tabs.
export default function Index() {
  const { state, refresh, logout } = useAuth();
  const theme = useTheme();

  if (state.status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.gold} />
      </View>
    );
  }

  // E12-08: organización suspendida (402 de /me) — antes esto se confundía
  // con una sesión inválida y mandaba a login en blanco sin explicar nada.
  if (state.status === "suspended") {
    return (
      <View style={[styles.container, styles.suspended, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Servicio suspendido</Text>
        <Text style={[styles.message, { color: theme.textMuted }]}>{state.message}</Text>
        <Button title="Reintentar" onPress={refresh} />
        <Button title="Cerrar sesión" variant="ghost" onPress={logout} />
      </View>
    );
  }

  return <Redirect href={state.status === "signedIn" ? homeRouteFor(state.user) : "/login"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  suspended: { paddingHorizontal: 32, gap: 16 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  message: { fontSize: 14, textAlign: "center" },
});
