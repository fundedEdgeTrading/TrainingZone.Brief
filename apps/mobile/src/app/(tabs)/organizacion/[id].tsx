import { useRef, useState } from "react";
import { Alert, PanResponder, Pressable, ScrollView, Text, View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useCreateStaff, useRemoveStaff, useStaff, useUpdateStaff } from "@/api/queries";
import { useTheme, radii, layout } from "@/theme/theme";
import { fonts, tabular, typo } from "@/theme/typography";
import { ScreenFrame } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Avatar } from "@/components/Avatar";
import { Chip, ChipRow } from "@/components/Chip";
import { ToggleRow } from "@/components/ToggleRow";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { pickImageAsDataUrl } from "@/utils/pick-image";
import { formatShortDate } from "@/utils/format";
import type { Role } from "@/api/types";

// D7 del handoff: ficha de equipo — foto, rol, imputación a centros y baja.
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "TRAINER", label: "Entrenador" },
  { value: "CENTER_DIRECTOR", label: "Dirección de centro" },
  { value: "RECEPTION", label: "Recepción" },
  { value: "HR_MANAGER", label: "RRHH" },
  { value: "OWNER", label: "Dirección" },
];

const CENTER_SCOPED: Role[] = ["CENTER_DIRECTOR", "TRAINER", "RECEPTION"];

export default function StaffFormScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStaff();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const removeStaff = useRemoveStaff();

  const isNew = id === "nuevo";
  const member = isNew ? undefined : data?.staff.find((s) => s.id === id);
  // Dirección de centro puede consultar el equipo, pero no editarlo
  // (canManageStaff en src/lib/rbac.ts): sin permiso, la ficha es de lectura.
  const canManage = data?.canManage ?? false;

  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [role, setRole] = useState<Role>(member?.role ?? "TRAINER");
  const [image, setImage] = useState<string | null>(member?.image ?? null);
  const [visibleInApp, setVisibleInApp] = useState(member?.visibleInApp ?? true);
  const [allocations, setAllocations] = useState<Record<string, number>>(
    Object.fromEntries((member?.allocations ?? []).map((a) => [a.centerId, a.pct ?? 0]))
  );
  const [baseCenterId, setBaseCenterId] = useState<string | null>(member?.allocations[0]?.centerId ?? null);
  const [error, setError] = useState<string | null>(null);

  const centers = data?.centers ?? [];
  const totalAllocation = Object.values(allocations).reduce((sum, pct) => sum + pct, 0);

  async function changePhoto() {
    const picked = await pickImageAsDataUrl([1, 1]);
    if (!picked) return;
    if (!picked.ok) return toast.show(picked.error, "critical");
    setImage(picked.dataUrl);
    if (!isNew && member) {
      try {
        await updateStaff.mutateAsync({ id: member.id, image: picked.dataUrl });
        toast.show("Foto actualizada.", "good");
      } catch (err) {
        toast.show(err instanceof Error ? err.message : "No se pudo guardar la foto.", "critical");
      }
    }
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Escribe el nombre.");

    try {
      if (isNew) {
        if (!email.trim()) return setError("Escribe el email de acceso.");
        if (CENTER_SCOPED.includes(role) && !baseCenterId) return setError("Este rol necesita un centro base.");
        await createStaff.mutateAsync({ name: name.trim(), email: email.trim(), role, centerId: baseCenterId });
        toast.show("Invitación enviada.", "good");
      } else if (member) {
        if (totalAllocation > 100) return setError("La imputación a centros no puede pasar del 100 %.");
        await updateStaff.mutateAsync({
          id: member.id,
          name: name.trim(),
          role,
          image,
          visibleInApp,
          allocations: Object.entries(allocations).map(([centerId, pct]) => ({ centerId, pct })),
        });
        toast.show("Ficha guardada.", "good");
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    }
  }

  /** Baja en dos pasos: avisar de qué implica y confirmar después. */
  function confirmRemoval() {
    if (!member) return;
    Alert.alert(
      "Dar de baja del equipo",
      `${member.name} dejará de aparecer en la app del socio y perderá su imputación a centros. Su histórico de sesiones y ventas se conserva.`,
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Continuar",
          style: "destructive",
          onPress: () =>
            Alert.alert("¿Seguro?", "Esta acción hay que deshacerla a mano si te equivocas.", [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Dar de baja",
                style: "destructive",
                onPress: async () => {
                  try {
                    await removeStaff.mutateAsync(member.id);
                    toast.show("Persona dada de baja del equipo.");
                    router.back();
                  } catch (err) {
                    toast.show(err instanceof Error ? err.message : "No se pudo dar de baja.", "critical");
                  }
                },
              },
            ]),
        },
      ]
    );
  }

  if (!isNew && data && !member) {
    return (
      <ScreenFrame withTabBar>
        <EmptyState icon="alert" title="No se ha encontrado a esa persona" />
      </ScreenFrame>
    );
  }

  return (
    <ScreenFrame padded={false} withTabBar>
      <LinearGradient colors={theme.heroGradient} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.hero}>
        <View style={styles.heroBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            hitSlop={10}
            onPress={() => router.back()}
            style={[styles.iconButton, { borderColor: "rgba(244,240,232,.25)" }]}
          >
            <Icon name="chevron-left" size={16} color="#F4F0E8" />
          </Pressable>
          <Text style={[typo.kicker, { color: theme.onInk.muted, flex: 1 }]}>{isNew ? "NUEVO MIEMBRO" : "FICHA DE EQUIPO"}</Text>
          {canManage ? (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={submit}>
              <Text style={[typo.button, { color: theme.goldSoft }]}>Guardar</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.photoBlock}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cambiar la foto" disabled={!canManage} onPress={changePhoto}>
            <Avatar name={name || "Nuevo"} uri={image} size={132} />
            <View style={[styles.photoButton, { backgroundColor: theme.gold }]}>
              <Icon name="plus" size={17} color="#1D1D1C" />
            </View>
          </Pressable>
          <Text style={styles.photoHint}>TOCA PARA CAMBIAR LA FOTO</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Nombre" value={name} onChangeText={setName} placeholder="Nombre y apellidos" />

        {isNew ? (
          <Field
            label="Email de acceso"
            value={email}
            onChangeText={setEmail}
            placeholder="persona@centro.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />
        ) : member ? (
          <Card tone="alt" padding={13}>
            <Text style={[typo.rowMeta, { color: theme.textMuted }]}>
              {member.email} · alta {formatShortDate(member.joinedAt)}
              {member.invitationPending ? " · invitación pendiente" : ""}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={[typo.label, { color: theme.textSecondary }]}>Rol</Text>
          <ChipRow>
            {ROLE_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.label} selected={role === option.value} onPress={() => setRole(option.value)} />
            ))}
          </ChipRow>
        </View>

        {isNew && CENTER_SCOPED.includes(role) ? (
          <View style={{ gap: 6 }}>
            <Text style={[typo.label, { color: theme.textSecondary }]}>Centro base</Text>
            <ChipRow>
              {centers.map((center) => (
                <Chip
                  key={center.id}
                  label={center.name}
                  tone="bone"
                  selected={baseCenterId === center.id}
                  onPress={() => setBaseCenterId(center.id)}
                />
              ))}
            </ChipRow>
          </View>
        ) : null}

        {!isNew ? (
          <>
            <Card style={{ gap: 12 }}>
              <View style={styles.allocationHeader}>
                <Text style={[typo.cardTitleSmall, { color: theme.text, flex: 1 }]}>Imputación a centros</Text>
                <Text style={[styles.total, { color: totalAllocation > 100 ? theme.critical : theme.textMuted }]}>
                  {totalAllocation}%
                </Text>
              </View>
              {centers.map((center) => (
                <AllocationRow
                  key={center.id}
                  label={center.name}
                  value={allocations[center.id] ?? 0}
                  onChange={(pct) => setAllocations((prev) => ({ ...prev, [center.id]: pct }))}
                />
              ))}
              {totalAllocation > 100 ? (
                <Text style={[typo.rowMeta, { color: theme.critical }]}>La suma no puede pasar del 100 %.</Text>
              ) : null}
            </Card>

            <ToggleRow
              label="Visible en la app del socio"
              description="Su foto y su nombre acompañan a las sesiones que dirige"
              value={visibleInApp}
              onValueChange={setVisibleInApp}
            />
          </>
        ) : null}

        {error ? <Text style={[typo.rowMeta, { color: theme.critical }]}>{error}</Text> : null}

        {canManage ? (
          <>
            <Button
              title={isNew ? "Enviar invitación" : "Guardar cambios"}
              variant="gold"
              size="lg"
              loading={createStaff.isPending || updateStaff.isPending}
              onPress={submit}
            />
            {!isNew ? (
              <Button title="Dar de baja del equipo" variant="danger" loading={removeStaff.isPending} onPress={confirmRemoval} />
            ) : null}
          </>
        ) : (
          <Text style={[typo.rowMeta, { color: theme.textMuted }]}>Tu rol puede consultar el equipo, pero no editarlo.</Text>
        )}
      </ScrollView>
    </ScreenFrame>
  );
}

/** Barra de imputación: se arrastra o se toca, en pasos de 5 %. */
function AllocationRow({ label, value, onChange }: { label: string; value: number; onChange: (pct: number) => void }) {
  const theme = useTheme();
  // Ref mutable para el ancho medido: el PanResponder lo lee en sus propios
  // callbacks (grant/move), que corren fuera del render.
  const width = useRef(96);

  function pctAt(x: number) {
    const ratio = Math.max(0, Math.min(1, x / width.current));
    return Math.round((ratio * 100) / 5) * 5;
  }

  // Responder creado una sola vez; sus callbacks (grant/move) leen el ref
  // de arriba fuera del render.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange(pctAt(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange(pctAt(e.nativeEvent.locationX)),
    })
  );

  function onLayout(e: LayoutChangeEvent) {
    width.current = e.nativeEvent.layout.width;
  }

  return (
    <View style={styles.allocationRow} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}, ${value} por ciento`}>
      <Text style={[typo.rowTitleSmall, { color: theme.text, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.allocationTouch} onLayout={onLayout} {...responder.panHandlers}>
        <View style={[styles.allocationTrack, { backgroundColor: theme.surfaceAlt }]}>
          <View style={{ width: `${value}%`, height: "100%", backgroundColor: theme.gold, borderRadius: radii.pill }} />
        </View>
      </View>
      <Text style={[styles.percent, { color: theme.textSecondary }]}>{value}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 330, paddingHorizontal: layout.screenPadding, paddingTop: 54 },
  heroBar: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconButton: { width: 38, height: 38, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  photoBlock: { alignItems: "center", gap: 12, marginTop: 22 },
  photoButton: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  photoHint: { fontFamily: "Poppins_500Medium", fontSize: 10.5, letterSpacing: 1.2, color: "#9C9686" },
  content: { gap: layout.gap, padding: layout.screenPadding, paddingBottom: 40 },
  allocationHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  total: { fontFamily: fonts.bold, fontSize: 13, ...tabular },
  allocationRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  allocationTouch: { width: 96, height: 30, justifyContent: "center" },
  allocationTrack: { height: 6, borderRadius: radii.pill, overflow: "hidden" },
  percent: { fontFamily: fonts.bold, fontSize: 12.5, width: 42, textAlign: "right", ...tabular },
});
