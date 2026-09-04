import { useState } from "react";
import { Alert, Pressable, RefreshControl, Text, View, StyleSheet } from "react-native";
import { goBack } from "@/utils/navigation";
import { useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, useToggleAnnouncement } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { stagger } from "@/theme/motion";
import { ScreenContainer } from "@/components/ScreenContainer";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Chip, ChipRow } from "@/components/Chip";
import { Field } from "@/components/Field";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { EmptyState } from "@/components/EmptyState";
import { FadeInUp } from "@/components/FadeInUp";
import { SkeletonList } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { formatDayMonth } from "@/utils/format";
import type { AnnouncementCategory, AnnouncementItem } from "@/api/types";

/**
 * Anuncios del centro. Esta pantalla se había quedado fuera del sistema de
 * diseño —tipografías escritas a mano en vez de la escala, `ActivityIndicator`
 * gris en vez del esqueleto, un `Modal` propio en lugar de `Sheet` y un cartel
 * de estado en vez del toast—, así que entrar aquí desde «Más» parecía otra
 * app. Es el mismo arreglo que ya se le hizo a `brief/index.tsx`.
 *
 * Lo que además estaba roto:
 *
 * - **Sin forma de volver.** Dirección de organización y dirección de centro
 *   llegan aquí por el índice «Más» (no la tienen en la barra), y la pantalla
 *   no tenía flecha: se entraba y no se salía.
 * - **El teclado tapaba el formulario.** El `Modal` propio no llevaba
 *   `KeyboardAvoidingView` —que es justo lo que `Sheet` sí hace— así que
 *   escribir el texto del anuncio era a ciegas.
 * - **El botón de publicar quedaba bajo el indicador de gestos**: la hoja
 *   pegaba su contenido al borde sin reservar el área segura.
 * - **Eliminar no preguntaba.** Un toque sin confirmación borraba el anuncio
 *   publicado, y no hay deshacer.
 */
const CATEGORIES: AnnouncementCategory[] = ["NEWS", "EVENT", "PROMO", "ALERT"];
const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  NEWS: "Noticia",
  EVENT: "Evento",
  PROMO: "Promoción",
  ALERT: "Alerta",
};
const CATEGORY_TONE: Record<AnnouncementCategory, "neutral" | "gold" | "good" | "critical"> = {
  NEWS: "neutral",
  EVENT: "gold",
  PROMO: "good",
  ALERT: "critical",
};

export default function AnnouncementsScreen() {
  const theme = useTheme();
  const toast = useToast();
  const { data, isLoading, isError, refetch, isRefetching } = useAnnouncements();
  const toggleAnnouncement = useToggleAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const [composing, setComposing] = useState(false);

  async function handleToggle(item: AnnouncementItem) {
    try {
      await toggleAnnouncement.mutateAsync({ id: item.id, active: !item.active });
      toast.show(item.active ? "Anuncio desactivado." : "Anuncio activado.", "good");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "No se pudo actualizar.", "critical");
    }
  }

  /** Borrar un anuncio publicado no se deshace: se pregunta antes. */
  function confirmDelete(item: AnnouncementItem) {
    Alert.alert("Eliminar el anuncio", `«${item.title}» dejará de verse en la app del socio. No se puede deshacer.`, [
      { text: "Volver", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAnnouncement.mutateAsync(item.id);
            toast.show("Anuncio eliminado.");
          } catch (err) {
            toast.show(err instanceof Error ? err.message : "No se pudo eliminar.", "critical");
          }
        },
      },
    ]);
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.gold} />}>
      <FadeInUp>
        <ScreenHeader
          kicker="LO QUE VE EL SOCIO"
          title="Anuncios"
          tight
          right={
            <View style={styles.headerActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                onPress={() => goBack("/mas")}
                style={[styles.iconButton, { borderColor: theme.border }]}
              >
                <Icon name="chevron-left" size={17} color={theme.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nuevo anuncio"
                onPress={() => setComposing(true)}
                style={[styles.iconButton, { borderColor: theme.border }]}
              >
                <Icon name="plus" size={17} color={theme.gold} />
              </Pressable>
            </View>
          }
        />
      </FadeInUp>

      {isLoading ? (
        <SkeletonList rows={3} note="Cargando tus anuncios…" />
      ) : isError || !data ? (
        <EmptyState icon="alert" title="No se pudieron cargar los anuncios" description="Desliza hacia abajo para reintentar." />
      ) : data.announcements.length === 0 ? (
        <EmptyState icon="bell" title="Sin anuncios" description="Publica el primero con el + de la cabecera." />
      ) : (
        data.announcements.map((item, index) => (
          <FadeInUp key={item.id} delay={stagger(index)}>
            <Card style={[styles.card, item.active ? null : { opacity: 0.55 }]}>
              <View style={styles.cardHeader}>
                <Text style={[typo.cardTitleSmall, { color: theme.text, flex: 1 }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Badge label={CATEGORY_LABEL[item.category]} tone={CATEGORY_TONE[item.category]} />
              </View>

              {item.body ? (
                <Text style={[typo.rowMeta, { color: theme.textSecondary, lineHeight: 17 }]} numberOfLines={4}>
                  {item.body}
                </Text>
              ) : null}

              <Text style={[typo.rowMetaSmall, { color: theme.textMuted }]} numberOfLines={1}>
                {item.centerName} · {item.viewsCount} {item.viewsCount === 1 ? "vista" : "vistas"} ·{" "}
                {formatDayMonth(item.createdAt)}
                {item.pinned ? " · fijado" : ""}
                {item.active ? "" : " · inactivo"}
              </Text>

              <View style={styles.actionsRow}>
                <Button
                  title={item.active ? "Desactivar" : "Activar"}
                  variant="outline"
                  size="sm"
                  style={{ flex: 1 }}
                  loading={toggleAnnouncement.isPending && toggleAnnouncement.variables?.id === item.id}
                  onPress={() => handleToggle(item)}
                />
                <Button
                  title="Eliminar"
                  variant="danger"
                  size="sm"
                  style={{ flex: 1 }}
                  loading={deleteAnnouncement.isPending && deleteAnnouncement.variables === item.id}
                  onPress={() => confirmDelete(item)}
                />
              </View>
            </Card>
          </FadeInUp>
        ))
      )}

      <ComposeSheet visible={composing} onClose={() => setComposing(false)} centers={data?.centers ?? []} />
    </ScreenContainer>
  );
}

/** Alta de anuncio. En `Sheet`, que es lo que aparta el formulario del teclado. */
function ComposeSheet({
  visible,
  onClose,
  centers,
}: {
  visible: boolean;
  onClose: () => void;
  centers: { id: string; name: string }[];
}) {
  const theme = useTheme();
  const toast = useToast();
  const createAnnouncement = useCreateAnnouncement();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("NEWS");
  const [centerId, setCenterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setBody("");
    setCategory("NEWS");
    setCenterId(null);
    setError(null);
  }

  async function submit() {
    if (!title.trim()) {
      setError("El anuncio necesita un título.");
      return;
    }
    if (!body.trim()) {
      setError("Añade un texto al anuncio.");
      return;
    }
    setError(null);
    try {
      await createAnnouncement.mutateAsync({
        title: title.trim(),
        body: body.trim(),
        imageUrl: null,
        category,
        audience: "ALL",
        centerId,
        pinned: false,
        tags: [],
        startsAt: null,
        endsAt: null,
      });
      reset();
      onClose();
      toast.show("Anuncio publicado.", "good");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el anuncio.");
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      kicker="NUEVO"
      title="Publicar un anuncio"
      footer={
        <View style={{ gap: 8 }}>
          <Button title="Publicar" variant="gold" size="lg" loading={createAnnouncement.isPending} onPress={submit} />
          <Button title="Ahora no" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      <Field label="Título" value={title} onChangeText={setTitle} placeholder="Cerramos el lunes por mantenimiento" />
      <Field
        label="Texto"
        value={body}
        onChangeText={setBody}
        placeholder="Lo que el socio tiene que saber, en dos líneas"
        multiline
      />

      <View style={{ gap: 6 }}>
        <Text style={[typo.label, { color: theme.textSecondary }]}>Categoría</Text>
        <ChipRow>
          {CATEGORIES.map((option) => (
            <Chip
              key={option}
              label={CATEGORY_LABEL[option]}
              selected={category === option}
              onPress={() => setCategory(option)}
            />
          ))}
        </ChipRow>
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[typo.label, { color: theme.textSecondary }]}>Alcance</Text>
        <ChipRow>
          <Chip label="Todos los centros" selected={centerId === null} onPress={() => setCenterId(null)} />
          {centers.map((center) => (
            <Chip
              key={center.id}
              label={center.name}
              selected={centerId === center.id}
              onPress={() => setCenterId(center.id)}
            />
          ))}
        </ChipRow>
      </View>

      {error ? <Text style={[typo.rowMeta, { color: theme.critical }]}>{error}</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: "row", gap: 8 },
  iconButton: { width: 40, height: 40, borderRadius: radii.control, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  card: { gap: 9 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 2 },
});
