import { router } from "expo-router";
import { Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/auth/auth-context";
import { useTheme, layout } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { Button } from "@/components/Button";

/**
 * E5-14 (D-M3): el muro de compra se retira — quien deja caducar el bono
 * entra en la app, no en el catálogo. Esta banda sustituye al muro: ofrece
 * renovar sin ocupar la pantalla entera, y se ve en todas las pestañas
 * mientras no haya bono vivo.
 */
export function MembershipBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();

  if (state.status !== "signedIn") return null;
  const { member } = state.user;
  if (!member || member.hasActiveMembership) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: layout.tabBarHeight + insets.bottom }]}
    >
      <View style={[styles.banner, { backgroundColor: theme.goldBg, borderTopColor: theme.gold }]}>
        <Text style={[typo.rowMetaSmall, { color: theme.text, flex: 1 }]} numberOfLines={2}>
          Tu bono ha caducado. Puedes seguir consultando tu historial; para reservar, renuévalo.
        </Text>
        <Button title="Renovar" variant="gold" size="sm" onPress={() => router.push("/onboarding/planes")} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: layout.gap,
    paddingVertical: 10,
  },
});
