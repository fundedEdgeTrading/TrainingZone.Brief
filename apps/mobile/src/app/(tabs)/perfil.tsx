import { Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export default function ProfileScreen() {
  const { state, logout } = useAuth();
  const theme = useTheme();
  const user = state.status === "signedIn" ? state.user : null;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <ScreenContainer>
      <View>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>MI CUENTA</Text>
        <Text style={[styles.title, { color: theme.text }]}>Perfil</Text>
      </View>

      <Card>
        <Text style={[styles.name, { color: theme.text }]}>{user?.name}</Text>
        <Text style={[styles.email, { color: theme.textMuted }]}>{user?.email}</Text>
      </Card>

      <Button title="Cerrar sesión" variant="secondary" onPress={handleLogout} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  name: { fontFamily: "Poppins_600SemiBold", fontSize: 17 },
  email: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 2 },
});
