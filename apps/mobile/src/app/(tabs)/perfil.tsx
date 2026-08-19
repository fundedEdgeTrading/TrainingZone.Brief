import { Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader, SectionTitle } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Divider, ListRow } from "@/components/Row";
import { FadeInUp } from "@/components/FadeInUp";
import type { Role } from "@/api/types";

/**
 * Perfil: además de la cuenta, es el índice de las pantallas que no caben en
 * la barra de cinco pestañas (calendario, evolución, anuncios, avisos…).
 */
const EXTRA_BY_ROLE: Record<Role, { href: string; label: string; meta: string }[]> = {
  MEMBER: [
    { href: "/calendario", label: "Mi calendario", meta: "Realizadas, reservadas y no presentadas" },
    { href: "/evolucion", label: "Mi evolución", meta: "Composición corporal y progreso" },
    { href: "/notificaciones", label: "Avisos", meta: "Novedades de tu centro" },
  ],
  TRAINER: [{ href: "/notificaciones", label: "Avisos", meta: "Alertas y recordatorios" }],
  OWNER: [
    { href: "/staff-agenda", label: "Agenda del centro", meta: "Timeline diaria y creación de sesiones" },
    { href: "/anuncios", label: "Anuncios", meta: "Comunicaciones a socios" },
    { href: "/notificaciones", label: "Avisos", meta: "Alertas de la organización" },
  ],
  CENTER_DIRECTOR: [
    { href: "/anuncios", label: "Anuncios", meta: "Comunicaciones a socios" },
    { href: "/notificaciones", label: "Avisos", meta: "Alertas del centro" },
  ],
  PLATFORM_ADMIN: [
    { href: "/anuncios", label: "Anuncios", meta: "Comunicaciones a socios" },
    { href: "/notificaciones", label: "Avisos", meta: "Alertas de la plataforma" },
  ],
  RECEPTION: [{ href: "/notificaciones", label: "Avisos", meta: "Alertas del centro" }],
  HR_MANAGER: [{ href: "/notificaciones", label: "Avisos", meta: "Alertas de personal" }],
};

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Dirección",
  CENTER_DIRECTOR: "Dirección de centro",
  TRAINER: "Entrenador",
  RECEPTION: "Recepción",
  MEMBER: "Socio",
  HR_MANAGER: "RRHH",
  PLATFORM_ADMIN: "Administración",
};

export default function ProfileScreen() {
  const { state, logout } = useAuth();
  const theme = useTheme();
  const user = state.status === "signedIn" ? state.user : null;
  const extras = user ? EXTRA_BY_ROLE[user.role] ?? [] : [];

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <ScreenContainer>
      <FadeInUp>
        <ScreenHeader kicker="MI CUENTA" title="Perfil" />
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

      {extras.length > 0 ? (
        <>
          <SectionTitle label="Más" />
          <FadeInUp delay={stagger(2)}>
            <Card tone="alt" padding={0} style={{ gap: 0 }}>
              {extras.map((item, index) => (
                <View key={item.href} style={{ paddingHorizontal: 14 }}>
                  {index > 0 ? <Divider /> : null}
                  <ListRow title={item.label} meta={item.meta} chevron onPress={() => router.push(item.href)} />
                </View>
              ))}
            </Card>
          </FadeInUp>
        </>
      ) : null}

      <Button title="Cerrar sesión" variant="outline" onPress={handleLogout} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
});
