import { useEffect, useState } from "react";
import {
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { homeRouteFor } from "@/auth/routes";
import { radii } from "@/theme/theme";
import { fonts, typo } from "@/theme/typography";
import { duration, easeOutSoft, useReducedMotion } from "@/theme/motion";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";

// A1 del handoff. Pantalla en tinta con dos manchas "aurora" a la deriva; el
// login es el único sitio de la app donde el fondo no sigue la piel del
// sistema: la marca entra siempre en oscuro.
const INK = "#0F0F0E";
const BONE = "#F4F0E8";
const GOLD = "#C8AB72";
const MUTED = "#9C9686";
const BORDER = "#46443C";

export default function LoginScreen() {
  const { state, login } = useAuth();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  if (state.status === "signedIn") return <Redirect href={homeRouteFor(state.user)} />;

  function shakeError() {
    if (reduced) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0.5, duration: 90, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]).start();
  }

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError("Escribe tu email y tu contraseña.");
      shakeError();
      return;
    }
    setError(null);
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      shakeError();
      return;
    }
    router.replace(homeRouteFor(result.user));
  }

  return (
    <View style={[styles.screen, { backgroundColor: INK }]}>
      <Aurora />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 28 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Image
              source={require("../../assets/images/logo-tz.png")}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Training Zone"
            />
            <Text style={[typo.kicker, { color: MUTED, marginTop: 26 }]}>SOCIO · ENTRENADOR · DIRECCIÓN</Text>
            <Text style={styles.title}>Entra en tu centro</Text>
          </View>

          <View style={styles.form}>
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
              secureTextEntry={!reveal}
              autoComplete="password"
              placeholder="••••••••"
              action={{ label: reveal ? "Ocultar" : "Ver", onPress: () => setReveal((v) => !v) }}
            />

            {error ? (
              <Animated.View
                style={[
                  styles.error,
                  { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) }] },
                ]}
              >
                <Text style={[typo.bodyMedium, { color: "#E08267" }]}>{error}</Text>
              </Animated.View>
            ) : null}

            <Button title="Entrar" size="lg" onPress={handleSubmit} loading={loading} style={{ marginTop: 4 }} />

            <Pressable accessibilityRole="button" hitSlop={8} style={styles.forgot}>
              <Text style={[typo.bodyMedium, { color: MUTED }]}>¿Has olvidado la contraseña?</Text>
            </Pressable>
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={[typo.legend, { color: MUTED }]}>O continúa con</Text>
            <View style={styles.divider} />
          </View>

          {/* Deshabilitados hasta que existan las variables de entorno de cada
              proveedor (ver README del repo): un botón que no puede funcionar
              se muestra apagado, no se esconde. */}
          <View style={styles.ssoRow}>
            <Button title="Microsoft" variant="outline" disabled style={styles.sso} />
            <Button title="Google" variant="outline" disabled style={styles.sso} />
          </View>
          <Text style={[typo.rowMetaSmall, { color: "#6E6A5E", textAlign: "center" }]}>
            El acceso con Microsoft y Google se activará en cuanto tu centro lo configure.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Dos manchas translúcidas con deriva lenta (24-30 s), en alternancia. */
function Aurora() {
  const reduced = useReducedMotion();
  const [driftA] = useState(() => new Animated.Value(0));
  const [driftB] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) return;
    const loop = (value: Animated.Value, ms: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: 1, duration: ms, easing: easeOutSoft, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: ms, easing: easeOutSoft, useNativeDriver: true }),
        ])
      );
    const animations = [loop(driftA, 24000), loop(driftB, 30000)];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [driftA, driftB, reduced]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.blob,
          styles.blobTop,
          { transform: [{ translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) }] },
        ]}
      />
      <Animated.View
        style={[
          styles.blob,
          styles.blobBottom,
          { transform: [{ translateX: driftB.interpolate({ inputRange: [0, 1], outputRange: [0, -36] }) }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 26, flexGrow: 1, justifyContent: "center" },
  header: { alignItems: "center" },
  logo: { width: 196, height: 76, opacity: 0.96 },
  title: { fontFamily: fonts.bold, fontSize: 30, color: BONE, marginTop: 8, textAlign: "center" },
  form: { gap: 14 },
  error: {
    backgroundColor: "rgba(224,130,103,.14)",
    borderRadius: radii.control,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  forgot: { alignSelf: "center", paddingVertical: 6 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  divider: { flex: 1, height: 1, backgroundColor: BORDER },
  ssoRow: { flexDirection: "row", gap: 10 },
  sso: { flex: 1 },
  blob: { position: "absolute", width: 280, height: 280, borderRadius: 140 },
  blobTop: { backgroundColor: "rgba(216,204,184,.18)", top: -70, right: -60 },
  blobBottom: { backgroundColor: "rgba(200,171,114,.2)", bottom: -60, left: -70 },
});
