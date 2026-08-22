import { ActivityIndicator, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useMarkNotificationRead, useNotifications } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { formatShortDate } from "@/utils/format";

export default function NotificationsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useNotifications();
  const markRead = useMarkNotificationRead();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <FadeInUp>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>BANDEJA</Text>
        <Text style={[styles.title, { color: theme.text }]}>Avisos</Text>
      </FadeInUp>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudieron cargar tus avisos" description="Desliza hacia abajo para reintentar." />
      ) : data.notifications.length === 0 ? (
        <EmptyState title="Todo al día" description="No tienes avisos pendientes." />
      ) : (
        data.notifications.map((n) => (
          <Card key={n.id}>
            <Text style={[styles.title2, { color: theme.text }]}>{n.title}</Text>
            {n.body ? <Text style={[styles.body, { color: theme.textMuted }]}>{n.body}</Text> : null}
            <View style={styles.footer}>
              <Text style={[styles.date, { color: theme.textMuted }]}>{formatShortDate(n.createdAt)}</Text>
              <Button
                title="Marcar como leído"
                variant="outline"
                onPress={() => markRead.mutate(n.id)}
                loading={markRead.isPending && markRead.variables === n.id}
              />
            </View>
          </Card>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  title2: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  body: { fontFamily: "Poppins_400Regular", fontSize: 13, marginTop: 4 },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  date: { fontFamily: "Poppins_500Medium", fontSize: 11, textTransform: "uppercase" },
});
