import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useDeleteProduct, useProducts, useSaveProduct } from "@/api/queries";
import { useTheme, radii, layout } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { ScreenFrame } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Segmented } from "@/components/Segmented";
import { Stepper } from "@/components/Stepper";
import { ToggleRow } from "@/components/ToggleRow";
import { Icon } from "@/components/Icon";
import { ProductThumb } from "@/components/ProductThumb";
import { useToast } from "@/components/Toast";
import { pickImageAsDataUrl } from "@/utils/pick-image";
import type { ServiceKind } from "@/api/types";

// D5 del handoff: editar producto y su foto.
export default function ProductFormScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useProducts();
  const saveProduct = useSaveProduct();
  const deleteProduct = useDeleteProduct();

  const isNew = id === "nuevo";
  const product = isNew ? undefined : data?.products.find((p) => p.id === id);

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [price, setPrice] = useState(product ? String(product.priceCents / 100) : "");
  const [sessions, setSessions] = useState(product?.sessionsIncluded ?? 8);
  const [unlimited, setUnlimited] = useState(product ? product.sessionsIncluded == null : false);
  const [serviceKind, setServiceKind] = useState<ServiceKind>(product?.serviceKind ?? "GROUP");
  const [visible, setVisible] = useState(product?.visible ?? true);
  const [error, setError] = useState<string | null>(null);

  const subscribers = product?.subscribersCount ?? 0;

  async function changePhoto() {
    const picked = await pickImageAsDataUrl([16, 10]);
    if (!picked) return;
    if (!picked.ok) {
      toast.show(picked.error, "critical");
      return;
    }
    setImageUrl(picked.dataUrl);
  }

  async function submit() {
    setError(null);
    const priceCents = Math.round(Number(price.replace(",", ".")) * 100);
    if (!name.trim()) return setError("El producto necesita un nombre.");
    if (!Number.isFinite(priceCents) || priceCents < 0) return setError("El precio no es válido.");

    try {
      await saveProduct.mutateAsync({
        id: isNew ? undefined : id,
        name: name.trim(),
        description: description.trim() || null,
        imageUrl,
        priceCents,
        sessionsIncluded: unlimited ? null : sessions,
        validityDays: null,
        serviceKind,
        visible,
      });
      toast.show(isNew ? "Producto creado." : "Producto guardado.", "good");
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el producto.");
    }
  }

  function confirmDelete() {
    if (!product) return;
    Alert.alert("Borrar el producto", `Se eliminará "${product.name}" del catálogo.`, [
      { text: "Volver", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteProduct.mutateAsync(product.id);
            toast.show("Producto borrado.");
            router.back();
          } catch (err) {
            toast.show(err instanceof Error ? err.message : "No se pudo borrar.", "critical");
          }
        },
      },
    ]);
  }

  return (
    <ScreenFrame withTabBar>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          hitSlop={10}
          onPress={() => router.back()}
          style={[styles.iconButton, { borderColor: theme.border }]}
        >
          <Icon name="chevron-left" size={16} color={theme.text} />
        </Pressable>
        <Text style={[typo.cardTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>
          {isNew ? "Nuevo producto" : "Editar producto"}
        </Text>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={submit} disabled={saveProduct.isPending}>
          <Text style={[typo.button, { color: theme.goldText }]}>Guardar</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar la foto del producto" onPress={changePhoto}>
          <ProductThumb uri={imageUrl} wide />
        </Pressable>
        <View style={styles.photoActions}>
          <Button title="Subir imagen" variant="outline" size="sm" icon="camera" onPress={changePhoto} />
          <Text style={[typo.rowMetaSmall, { color: theme.textFaint, flex: 1 }]}>
            Aparecerá en el catálogo del socio · 1600 × 1000
          </Text>
        </View>

        <Field label="Nombre" value={name} onChangeText={setName} placeholder="Bono 8 sesiones" />
        <Field
          label="Descripción"
          value={description}
          onChangeText={setDescription}
          placeholder="Una línea por ventaja: se muestran como puntos en el catálogo"
          multiline
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label="Precio" value={price} onChangeText={setPrice} keyboardType="decimal-pad" suffix="€/mes" />
          </View>
          {!unlimited ? <Stepper label="Sesiones" value={sessions} onChange={setSessions} min={1} max={60} /> : null}
        </View>

        <ToggleRow label="Sesiones sin límite" description="Cuota mensual en vez de bono de sesiones" value={unlimited} onValueChange={setUnlimited} />

        <View style={{ gap: 6 }}>
          <Text style={[typo.label, { color: theme.textSecondary }]}>Servicio</Text>
          <Segmented
            options={[
              { value: "EP", label: "Personal" },
              { value: "GROUP", label: "Grupo" },
              { value: "ONLINE", label: "Online" },
            ]}
            value={serviceKind}
            onChange={setServiceKind}
          />
        </View>

        <ToggleRow label="Visible para socios" description="Si lo ocultas, deja de aparecer en el catálogo" value={visible} onValueChange={setVisible} />

        {error ? <Text style={[typo.rowMeta, { color: theme.critical }]}>{error}</Text> : null}

        {!isNew ? (
          <Card tone="alt" style={{ gap: 8 }}>
            {subscribers > 0 ? (
              <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
                Este producto tiene {subscribers} {subscribers === 1 ? "socio suscrito" : "socios suscritos"}: no se puede
                borrar, ocúltalo si ya no lo vendes.
              </Text>
            ) : (
              <>
                <Text style={[typo.rowMeta, { color: theme.textMuted }]}>Nadie lo tiene contratado, así que se puede borrar.</Text>
                <Button title="Borrar producto" variant="danger" onPress={confirmDelete} loading={deleteProduct.isPending} />
              </>
            )}
          </Card>
        ) : null}

        <Button
          title={isNew ? "Crear producto" : "Guardar cambios"}
          variant="gold"
          size="lg"
          loading={saveProduct.isPending}
          onPress={submit}
        />
      </ScrollView>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  iconButton: { width: 38, height: 38, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  content: { gap: layout.gap, paddingBottom: 40 },
  photoActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  row: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
});
