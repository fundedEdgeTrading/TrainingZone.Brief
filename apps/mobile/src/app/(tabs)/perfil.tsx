import { Pressable, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { goBack } from "@/utils/navigation";
import { useAuth } from "@/auth/auth-context";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Icon } from "@/components/Icon";
import { Divider, ListRow } from "@/components/Row";
import { FadeInUp } from "@/components/FadeInUp";
import type { Role } from "@/api/types";

/**
 * Mi cuenta. Deja de ser el índice de la app —eso es ahora «Más»— y vuelve a
 * ser lo que su nombre promete: quién eres, con qué rol entras y cómo sales.
 *
 * Cerrar sesión vive AQUÍ y no en la pestaña: es la acción menos frecuente y
 * la más costosa de deshacer, así que no debe estar a un toque de la barra.
 */
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

export default function AccountScreen() {
  const { state, logout } = useAuth();
  const theme = useTheme();
  const user = state.status === "signedIn" ? state.user : null;
  const isMember = user?.role === "MEMBER";

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <ScreenContainer>
      <FadeInUp>
        <ScreenHeader
          kicker="MI CUENTA"
          title="Tus datos"
          tight
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver"
              onPress={() => goBack("/mas")}
              style={[styles.iconButton, { borderColor: theme.border }]}
            >
              <Icon name="chevron-left" size={17} color={theme.text} />
            </Pressable>
          }
        />
      </FadeInUp>

      <FadeInUp delay={stagger(1)}>
        <Card style={styles.card}>
          <Avatar name={user?.name ?? ""} uri={user?.image} size={54} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[typo.cardTitle, { color: theme.text }]} numberOfLines={1}>
              {user?.name}
            </Text>
            <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
              {user?.email}
            </Text>
            {user ? <Badge label={ROLE_LABEL[user.role]} tone="gold" /> : null}
          </View>
        </Card>
      </FadeInUp>

      {isMember ? (
        <FadeInUp delay={stagger(2)}>
          <Card tone="alt" padding={0} style={{ gap: 0 }}>
            <View style={styles.listInset}>
              <ListRow
                title="Mi evolución"
                meta="Tus medidas, tu progreso y el consentimiento que lo permite"
                chevron
                onPress={() => router.push("/evolucion")}
              />
              <Divider />
              <ListRow title="Mis bonos" meta="Todos tus bonos y su estado" chevron onPress={() => router.push("/bonos")} />
            </View>
          </Card>
        </FadeInUp>
      ) : null}

      <FadeInUp delay={stagger(3)}>
        <Button title="Cerrar sesión" variant="danger" onPress={handleLogout} />
      </FadeInUp>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  listInset: { paddingHorizontal: 14 },
});
