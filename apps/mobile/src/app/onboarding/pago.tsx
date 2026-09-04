import { useState } from "react";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import * as WebBrowser from "expo-web-browser";
import { useCheckout, useProducts } from "@/api/queries";
import { useAuth } from "@/auth/auth-context";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { ScreenFrame } from "@/components/ScreenContainer";
import { HeroCard } from "@/components/HeroCard";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { Divider } from "@/components/Row";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { formatEuros, formatShortDate } from "@/utils/format";

/**
 * A3 del handoff: confirmar y pagar.
 *
 * El handoff describe un formulario de tarjeta con la nota de que, si se usa
 * una hoja de pago nativa, no hay que maquetar campos propios. Aquí el cobro
 * sale por Stripe Checkout sobre la cuenta conectada del gimnasio (lo que ya
 * usa la web, `member-billing.ts`) y se abre en el navegador del dispositivo:
 * ni la app ni el servidor llegan a tocar el número de tarjeta.
 */
export default function CheckoutScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { refresh } = useAuth();
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const { data } = useProducts();
  const checkout = useCheckout();
  const [manualReason, setManualReason] = useState<string | null>(null);

  const product = data?.products.find((p) => p.id === planId);

  const nextCharge = new Date();
  nextCharge.setMonth(nextCharge.getMonth() + 1);

  async function pay() {
    if (!product) return;
    try {
      const result = await checkout.mutateAsync(product.id);
      if (result.mode === "manual") {
        setManualReason(result.reason);
        return;
      }
      await WebBrowser.openBrowserAsync(result.url);
      // Al volver del navegador se relee /me: si el pago cuajó, el gate cae y
      // el socio entra al portal.
      await refresh();
      toast.show("Comprobando tu pago…");
      router.replace("/(tabs)");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo iniciar el pago.", "critical");
    }
  }

  return (
    <ScreenFrame>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={10}
          onPress={() => goBack("/onboarding/planes")}
          style={[styles.back, { borderColor: theme.border }]}
        >
          <Icon name="chevron-left" size={16} color={theme.text} />
        </Pressable>
        <Text style={[typo.cardTitle, { color: theme.text }]}>Confirmar y pagar</Text>
      </View>

      {!product ? (
        <EmptyState icon="alert" title="Ese plan ya no está disponible" description="Vuelve al catálogo y elige otro." />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <HeroCard>
            <Text style={[typo.kicker, { color: theme.goldSoft }]}>TU PLAN</Text>
            <Text style={[styles.planName, { color: theme.onInk.text }]} numberOfLines={2}>
              {product.name}
            </Text>
            <Text style={[typo.rowMeta, { color: theme.onInk.secondary }]}>
              {product.sessionsIncluded ? `${product.sessionsIncluded} sesiones` : "Sesiones sin límite"}
              {product.validityDays ? ` · caducan a ${product.validityDays} días` : ""}
            </Text>

            <View style={[styles.heroDivider, { backgroundColor: "rgba(244,240,232,.14)" }]} />

            <SummaryRow label="Primer cobro hoy" value={formatEuros(product.priceCents, { decimals: true })} />
            <SummaryRow label="Siguiente cobro" value={formatShortDate(nextCharge.toISOString())} muted />
          </HeroCard>

          <Card style={{ gap: 12 }}>
            <Text style={[typo.cardTitleSmall, { color: theme.text }]}>Pago seguro con tarjeta</Text>
            <Divider />
            <View style={styles.notice}>
              <View style={[styles.noticeDot, { backgroundColor: theme.good }]} />
              <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>
                El cobro se completa en la pasarela segura de tu centro, fuera de la app: ni Training Zone ni tu móvil
                guardan el número de tarjeta. La tarjeta queda registrada para las renovaciones y puedes eliminarla
                desde Mi membresía.
              </Text>
            </View>
          </Card>

          {manualReason ? (
            <Card style={{ borderColor: theme.warning, gap: 8 }}>
              <Text style={[typo.cardTitleSmall, { color: theme.warning }]}>Tu centro aún no tiene el pago online activo</Text>
              <Text style={[typo.rowMeta, { color: theme.textSecondary }]}>
                Habla con recepción para activar tu bono: en cuanto lo registren, entrarás directamente al portal.
              </Text>
              <Text style={[typo.rowMetaSmall, { color: theme.textFaint }]}>{manualReason}</Text>
            </Card>
          ) : null}

          <Button
            title={`Pagar ${formatEuros(product.priceCents, { decimals: true })}`}
            variant="gold"
            size="lg"
            loading={checkout.isPending}
            onPress={pay}
          />
          <Text style={[typo.legend, { color: theme.textFaint, textAlign: "center" }]}>
            Se abrirá el pago seguro de tu centro
          </Text>
        </ScrollView>
      )}
    </ScreenFrame>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.summaryRow}>
      <Text style={[typo.rowMeta, { color: theme.onInk.muted }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: muted ? theme.onInk.secondary : theme.onInk.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  back: { width: 38, height: 38, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  content: { gap: layout.gap, paddingBottom: 32 },
  planName: { fontFamily: fonts.bold, fontSize: 20, marginTop: 6 },
  heroDivider: { height: 1, marginVertical: 14 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 5 },
  summaryValue: { fontFamily: fonts.bold, fontSize: 14, ...tabular },
  notice: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  noticeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
});
