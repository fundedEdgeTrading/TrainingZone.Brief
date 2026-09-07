import { Linking, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WEB_APP_URL } from "@/api/client";
import { useAuth } from "@/auth/auth-context";
import { useTheme, layout, radii } from "@/theme/theme";
import { fonts, typo } from "@/theme/typography";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import type { Role } from "@/api/types";

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dirección",
  CENTER_DIRECTOR: "Dirección de centro",
  TRAINER: "Entrenador",
  TRAINER_ADMIN: "Entrenador Admin",
  RECEPTION: "Recepción",
  MEMBER: "Socio",
  HR_MANAGER: "RRHH",
  PLATFORM_ADMIN: "Administración",
};

/**
 * E13-01 (D-M4): la app móvil se recorta a socio y entrenador. Quien entra con
 * otro rol NO se encuentra ninguna pestaña ni una rejilla vacía —eso es lo que
 * hoy ve `PLATFORM_ADMIN`—: se le explica, con el enlace a la web, dónde está
 * su trabajo de verdad.
 */
export function UnsupportedRoleScreen({ role }: { role: Role }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Icon name="building" size={26} color={theme.textMuted} />
      </View>
      <Text style={[typo.screenTitle, styles.title, { color: theme.text }]}>Tu trabajo se hace desde la web</Text>
      <Text style={[typo.rowMeta, styles.body, { color: theme.textSecondary }]}>
        La app de Training Zone está pensada para socios y entrenadores. Como {ROLE_LABEL[role]}, tus herramientas están
        completas en el portal web, no aquí.
      </Text>
      <View style={styles.actions}>
        <Button title="Abrir el portal web" variant="gold" onPress={() => Linking.openURL(WEB_APP_URL)} />
        <Button title="Cerrar sesión" variant="outline" onPress={() => logout()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: layout.gap * 2 },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: radii.control,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontFamily: fonts.bold, textAlign: "center", marginBottom: 10 },
  body: { textAlign: "center", lineHeight: 20, marginBottom: 26 },
  actions: { width: "100%", gap: 10 },
});
