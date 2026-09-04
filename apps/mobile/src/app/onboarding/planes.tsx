import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useProducts } from "@/api/queries";
import { useAuth } from "@/auth/auth-context";
import { useTheme, radii } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { ProductThumb } from "@/components/ProductThumb";
import { Icon } from "@/components/Icon";
import { formatEuros } from "@/utils/format";
import type { ProductItem } from "@/api/types";

// A2 del handoff: catálogo del centro en el primer login del socio. Mientras no
// haya bono vivo, esta pantalla sustituye a las tabs (ver (tabs)/_layout.tsx).
export default function PlansScreen() {
  const theme = useTheme();
  const { state, logout } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useProducts();

  const firstName = state.status === "signedIn" ? state.user.member?.firstName ?? state.user.name.split(" ")[0] : "";
  const centerName = state.status === "signedIn" ? state.user.member?.centerName : null;
  // La misma pantalla hace dos papeles: el gate de compra del primer login y
  // «Ampliar» desde Más. Con bono vivo hay que poder volver, y el copy cambia:
  // no se está eligiendo plan por primera vez, se está cambiando el que hay.
  const upgrading = state.status === "signedIn" && Boolean(state.user.member?.hasActiveMembership);
  const products = (data?.products ?? []).filter((p) => p.visible);
  const featured = products.find((p) => p.featured) ?? products[0];
  const rest = products.filter((p) => p.id !== featured?.id);

  return (
    <ScreenContainer
      withTabBar={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}
    >
      <FadeInUp>
        <ScreenHeader
          kicker={centerName ? centerName.toUpperCase() : "TU CENTRO"}
          title={upgrading ? "Ampliar tu bono" : firstName ? `Elige tu plan, ${firstName}` : "Elige tu plan"}
          tight={upgrading}
          right={
            upgrading ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                onPress={() => router.back()}
                style={[styles.backButton, { borderColor: theme.border }]}
              >
                <Icon name="chevron-left" size={17} color={theme.text} />
              </Pressable>
            ) : undefined
          }
        />
        <Text style={[typo.rowMeta, { color: theme.textMuted, marginTop: 8 }]}>
          {upgrading
            ? "El cambio se aplica en tu próxima renovación: no pierdes las sesiones del bono actual."
            : "Puedes cambiarlo o ampliarlo cuando quieras desde Más."}
        </Text>
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} shape="row" note="Cargando el catálogo de tu centro…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudo cargar el catálogo" description="Desliza hacia abajo para reintentar." />
      ) : products.length === 0 ? (
        <EmptyState
          icon="box"
          title="Tu centro aún no ha publicado planes"
          description="En cuanto los publique, aparecerán aquí para que elijas."
        />
      ) : (
        <>
          {featured ? (
            <FadeInUp delay={stagger(1)}>
              <FeaturedPlan product={featured} />
            </FadeInUp>
          ) : null}

          {rest.map((product, index) => (
            <FadeInUp key={product.id} delay={stagger(index + 2)}>
              <PlanCard product={product} />
            </FadeInUp>
          ))}

          <Text style={[typo.rowMetaSmall, { color: theme.textFaint, textAlign: "center" }]}>
            Sin contrato de permanencia · cancela cuando quieras
          </Text>
        </>
      )}

      {/* Salir solo tiene sentido en el gate: quien viene de «Ampliar» ya está
          dentro de la app y solo quiere volver. */}
      {!upgrading ? (
        <Pressable accessibilityRole="button" onPress={logout} style={styles.logout}>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>Cerrar sesión</Text>
        </Pressable>
      ) : null}
    </ScreenContainer>
  );
}

/** Bullets del plan: cada línea (o cada `·`) de la descripción es un punto. */
function bulletsOf(product: ProductItem): string[] {
  const raw = product.description?.split(/\n|·/) ?? [];
  const bullets = raw.map((line) => line.trim()).filter(Boolean).slice(0, 3);
  if (bullets.length > 0) return bullets;
  return [
    product.sessionsIncluded ? `${product.sessionsIncluded} sesiones incluidas` : "Sesiones sin límite",
    product.serviceKind === "EP" ? "Entrenamiento personal" : product.serviceKind === "ONLINE" ? "Entrenamiento online" : "Grupos reducidos",
    product.validityDays ? `Caducan a ${product.validityDays} días` : "Sin caducidad",
  ];
}

function subtitleOf(product: ProductItem): string {
  const parts = [
    product.sessionsIncluded ? `${product.sessionsIncluded} sesiones` : "Sesiones sin límite",
    product.validityDays ? `caducan a ${product.validityDays} días` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function FeaturedPlan({ product }: { product: ProductItem }) {
  const theme = useTheme();
  return (
    <LinearGradient
      colors={theme.mode === "dark" ? ["#26251F", "#1D1D1C"] : ["#FFFFFF", "#F6EFE1"]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.featured, { borderColor: theme.gold }]}
    >
      <View style={styles.featuredHeader}>
        <ProductThumb uri={product.imageUrl} size={64} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[styles.featuredName, { color: theme.text }]} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{subtitleOf(product)}</Text>
        </View>
        <Badge label="Más elegido" tone="ink" />
      </View>

      <View style={{ gap: 7, marginTop: 14 }}>
        {bulletsOf(product).map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <View style={[styles.bullet, { backgroundColor: theme.gold }]} />
            <Text style={[typo.rowMeta, { color: theme.textSecondary, flex: 1 }]}>{bullet}</Text>
          </View>
        ))}
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceBlock}>
          <Text style={[styles.price, { color: theme.text }]}>{formatEuros(product.priceCents)}</Text>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>/mes</Text>
        </View>
        <Button title="Elegir" onPress={() => router.push({ pathname: "/onboarding/pago", params: { planId: product.id } })} />
      </View>
    </LinearGradient>
  );
}

function PlanCard({ product }: { product: ProductItem }) {
  const theme = useTheme();
  return (
    <Card padding={15} style={{ gap: 12 }}>
      <View style={styles.featuredHeader}>
        <ProductThumb uri={product.imageUrl} size={56} />
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[typo.cardTitleSmall, { color: theme.text }]} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>{subtitleOf(product)}</Text>
        </View>
      </View>
      <View style={styles.priceRow}>
        <Text style={[styles.priceSmall, { color: theme.text }]}>{formatEuros(product.priceCents)}</Text>
        <Button
          title="Elegir"
          variant="outline"
          size="sm"
          onPress={() => router.push({ pathname: "/onboarding/pago", params: { planId: product.id } })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  featured: { borderRadius: radii.hero, borderWidth: 1, padding: 16 },
  featuredHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  featuredName: { fontFamily: fonts.bold, fontSize: 17 },
  bulletRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  bullet: { width: 5, height: 5, borderRadius: 3 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14 },
  priceBlock: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  price: { fontFamily: fonts.bold, fontSize: 27, ...tabular },
  priceSmall: { fontFamily: fonts.bold, fontSize: 22, ...tabular },
  logout: { alignSelf: "center", paddingVertical: 10 },
  backButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
