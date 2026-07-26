import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";

// Splash/auto-login (F1 §5.4): mientras se resuelve el refresh token guardado
// en SecureStore, muestra un loader; después reparte a login o al shell de tabs.
export default function Index() {
  const { state } = useAuth();
  const theme = useTheme();

  if (state.status === "loading") {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.text} />
      </View>
    );
  }

  return <Redirect href={state.status === "signedIn" ? "/(tabs)" : "/login"} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
});
