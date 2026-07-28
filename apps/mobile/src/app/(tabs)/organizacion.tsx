import { ActivityIndicator, RefreshControl, Text, View, StyleSheet } from "react-native";
import { useOrganization } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";

export default function OrganizationScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useOrganization();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <View>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>ADMINISTRACIÓN</Text>
        <Text style={[styles.title, { color: theme.text }]}>{data?.organization?.name ?? "Organización"}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar la organización" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Centros</Text>
            {data.centers.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Sin centros.</Text>
            ) : (
              data.centers.map((c) => (
                <View key={c.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{c.name}</Text>
                    <Text style={[styles.rowMeta, { color: theme.textMuted }]}>{c.timezone}</Text>
                  </View>
                  <Text style={[styles.rowValue, { color: theme.textSecondary }]}>
                    {c.membersCount} socios · {c.staffCount} staff
                  </Text>
                </View>
              ))
            )}
          </Card>

          <Card>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Personal</Text>
            {data.staff.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontFamily: "Poppins_400Regular", fontSize: 13 }}>Sin personal registrado.</Text>
            ) : (
              data.staff.map((s) => (
                <View key={s.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{s.name}</Text>
                    <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                      {s.email}
                      {s.centerNames.length > 0 ? ` · ${s.centerNames.join(", ")}` : ""}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <Badge label={s.roleLabel} tone="neutral" />
                    {s.invitationPending ? <Badge label="Invitación pendiente" tone="warning" /> : null}
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 24, marginTop: 4 },
  cardTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(0,0,0,0.08)" },
  rowTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  rowMeta: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  rowValue: { fontFamily: "Poppins_500Medium", fontSize: 12 },
});
