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

  // Dos paradas con la sesión INTACTA, que antes acababan las dos en el login
  // sin explicar nada: la organización suspendida (402 de /me, E12-08) y el
  // arranque sin conexión. En las dos se conserva la sesión y se puede
  // reintentar, que es lo único que hace falta cuando vuelve la cobertura.
  if (state.status === "suspended" || state.status === "offline") {
    return (
      <View style={[styles.container, styles.suspended, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>
          {state.status === "suspended" ? "Servicio suspendido" : "Sin conexión"}
        </Text>
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
