import { Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useProducts } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { ProductThumb } from "@/components/ProductThumb";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { formatEuros } from "@/utils/format";

// D4 del handoff: productos a la venta. Un producto sin suscriptores se puede
// borrar; con suscriptores solo se oculta (misma regla en la API).
export default function ProductsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useProducts();

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader kicker="DIRECCIÓN" title="Productos a la venta" tight />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar los productos" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          {data.products.length === 0 ? (
            <EmptyState icon="box" title="Sin productos" description="Crea el primero para que aparezca en el catálogo del socio." />
          ) : (
            data.products.map((product, index) => {
              const deletable = product.subscribersCount === 0;
              return (
                <FadeInUp key={product.id} delay={stagger(index)}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar ${product.name}`}
                    onPress={() => router.push({ pathname: "/productos/[id]", params: { id: product.id } })}
                  >
                    <Card padding={13} tone={deletable ? "dashed" : "default"} style={styles.row}>
                      <ProductThumb uri={product.imageUrl} size={66} />
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={[styles.name, { color: theme.text }]} numberOfLines={2}>
                          {product.name}
                        </Text>
                        <Text style={[typo.rowMeta, { color: theme.textMuted }]} numberOfLines={1}>
                          {product.sessionsIncluded ? `${product.sessionsIncluded} sesiones` : "Sin límite"} ·{" "}
                          {formatEuros(product.priceCents)}/mes
                        </Text>
                        <View style={styles.badgeRow}>
                          <Badge label={product.visible ? "Visible" : "Oculto"} tone={product.visible ? "good" : "warning"} />
                          {product.subscribersCount != null ? (
                            <Badge
                              label={
                                deletable ? "0 socios · se puede borrar" : `${product.subscribersCount} socios`
                              }
                              tone={deletable ? "critical" : "neutral"}
                            />
                          ) : null}
                        </View>
                      </View>
                      <Icon name="chevron-right" size={15} color={theme.textFaint} />
                    </Card>
                  </Pressable>
                </FadeInUp>
              );
            })
          )}

          {data.canManage ? (
            <Button
              title="+ Nuevo producto"
              variant="gold"
              onPress={() => router.push({ pathname: "/productos/[id]", params: { id: "nuevo" } })}
            />
          ) : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: fonts.bold, fontSize: 15, ...tabular },
  badgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
});
