import { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { Redirect, router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";

export default function LoginScreen() {
  const { state, login } = useAuth();
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (state.status === "signedIn") return <Redirect href="/(tabs)" />;

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace("/(tabs)");
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.ink }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: theme.textMuted }]}>TRAINING ZONE</Text>
          <Text style={[styles.title, { color: theme.inkText }]}>Portal del socio</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="tu@email.com"
          />
          <Field
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="••••••••"
          />
          {error ? <Text style={[styles.error, { color: theme.critical }]}>{error}</Text> : null}
          <Button title="Entrar" onPress={handleSubmit} loading={loading} disabled={!email || !password} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: 24, gap: 32 },
  header: { gap: 6, paddingHorizontal: 4 },
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 12, letterSpacing: 2 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 28 },
  card: { borderRadius: 20, borderWidth: 1, padding: 22, gap: 16 },
  error: { fontFamily: "Poppins_500Medium", fontSize: 13 },
});
