import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { homeRouteFor } from "@/auth/routes";
import { useTheme } from "@/theme/theme";

// Splash/auto-login (F1 §5.4): mientras se resuelve el refresh token guardado
// en SecureStore, muestra un loader; después reparte a login, al catálogo de
// bonos (socio sin membresía viva) o al shell de tabs.
export default function Index() {
  const { state } = useAuth();
  const theme = useTheme();

  if (state.status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.gold} />
      </View>
    );
  }

  return <Redirect href={state.status === "signedIn" ? homeRouteFor(state.user) : "/login"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
