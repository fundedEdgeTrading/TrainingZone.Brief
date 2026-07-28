import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { useAnnouncements, useCreateAnnouncement, useDeleteAnnouncement, useToggleAnnouncement } from "@/api/queries";
import { useTheme } from "@/theme/theme";
import { ScreenContainer } from "@/components/ScreenContainer";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { EmptyState } from "@/components/EmptyState";
import type { AnnouncementCategory, AnnouncementItem } from "@/api/types";

const CATEGORIES: AnnouncementCategory[] = ["NEWS", "EVENT", "PROMO", "ALERT"];
const CATEGORY_LABEL: Record<AnnouncementCategory, string> = { NEWS: "Noticia", EVENT: "Evento", PROMO: "Promoción", ALERT: "Alerta" };

export default function AnnouncementsScreen() {
  const theme = useTheme();
  const { data, isLoading, isError, refetch, isRefetching } = useAnnouncements();
  const createAnnouncement = useCreateAnnouncement();
  const toggleAnnouncement = useToggleAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();
  const [modalOpen, setModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleToggle(item: AnnouncementItem) {
    setFeedback(null);
    try {
      await toggleAnnouncement.mutateAsync({ id: item.id, active: !item.active });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "No se pudo actualizar.");
    }
  }

  async function handleDelete(id: string) {
    setFeedback(null);
    try {
      await deleteAnnouncement.mutateAsync(id);
      setFeedback("Anuncio eliminado.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "No se pudo eliminar.");
    }
  }

  return (
    <ScreenContainer refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.text} />}>
      <View>
        <Text style={[styles.kicker, { color: theme.textMuted }]}>ADMINISTRACIÓN</Text>
        <Text style={[styles.title, { color: theme.text }]}>Anuncios</Text>
      </View>

      {feedback ? (
        <Card style={{ paddingVertical: 10 }}>
          <Text style={{ color: theme.text, fontFamily: "Poppins_500Medium", fontSize: 13 }}>{feedback}</Text>
        </Card>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: 24 }} />
      ) : isError || !data ? (
        <EmptyState title="No se pudo cargar los anuncios" description="Desliza hacia abajo para reintentar." />
      ) : (
        <>
          <Button title="+ Nuevo anuncio" onPress={() => setModalOpen(true)} />

          {data.announcements.length === 0 ? (
            <EmptyState title="Sin anuncios" description="Todavía no has publicado ningún anuncio." />
          ) : (
            data.announcements.map((a) => (
              <Card key={a.id} style={{ opacity: a.active ? 1 : 0.55 }}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.announcementTitle, { color: theme.text }]}>{a.title}</Text>
                  <Badge label={CATEGORY_LABEL[a.category]} tone="neutral" />
                </View>
                {a.body ? <Text style={[styles.announcementBody, { color: theme.textSecondary }]}>{a.body}</Text> : null}
                <Text style={[styles.announcementMeta, { color: theme.textMuted }]}>
                  {a.centerName} · {a.viewsCount} vistas{a.pinned ? " · fijado" : ""}
                </Text>
                <View style={styles.actionsRow}>
                  <Button title={a.active ? "Desactivar" : "Activar"} variant="secondary" onPress={() => handleToggle(a)} loading={toggleAnnouncement.isPending} />
                  <Button title="Eliminar" variant="danger" onPress={() => handleDelete(a.id)} loading={deleteAnnouncement.isPending} />
                </View>
              </Card>
            ))
          )}

          <CreateAnnouncementModal
            visible={modalOpen}
            onClose={() => setModalOpen(false)}
            centers={data.centers}
            createAnnouncement={createAnnouncement}
            onCreated={() => {
              setModalOpen(false);
              setFeedback("Anuncio creado.");
            }}
          />
        </>
      )}
    </ScreenContainer>
  );
}

function CreateAnnouncementModal({
  visible,
  onClose,
  centers,
  createAnnouncement,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  centers: { id: string; name: string }[];
  createAnnouncement: ReturnType<typeof useCreateAnnouncement>;
  onCreated: () => void;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AnnouncementCategory>("NEWS");
  const [centerId, setCenterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    if (!title.trim()) {
      setError("El anuncio necesita un título.");
      return;
    }
    if (!body.trim()) {
      setError("Añade un texto al anuncio.");
      return;
    }
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
      setTitle("");
      setBody("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el anuncio.");
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
          <ScrollView contentContainerStyle={{ gap: 14 }}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Nuevo anuncio</Text>
            <Field label="Título" value={title} onChangeText={setTitle} placeholder="Título del anuncio" />
            <Field label="Texto" value={body} onChangeText={setBody} placeholder="Contenido" multiline numberOfLines={4} />

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Categoría</Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: category === c ? theme.ink : "transparent" }]}
                >
                  <Text style={{ color: category === c ? theme.inkText : theme.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                    {CATEGORY_LABEL[c]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>Alcance</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setCenterId(null)}
                style={[styles.chip, { borderColor: theme.border, backgroundColor: centerId === null ? theme.ink : "transparent" }]}
              >
                <Text style={{ color: centerId === null ? theme.inkText : theme.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>Global</Text>
              </Pressable>
              {centers.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCenterId(c.id)}
                  style={[styles.chip, { borderColor: theme.border, backgroundColor: centerId === c.id ? theme.ink : "transparent" }]}
                >
                  <Text style={{ color: centerId === c.id ? theme.inkText : theme.text, fontFamily: "Poppins_500Medium", fontSize: 12 }}>
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={{ color: theme.critical, fontFamily: "Poppins_500Medium", fontSize: 13 }}>{error}</Text> : null}

            <Button title="Publicar" onPress={handleSubmit} loading={createAnnouncement.isPending} />
            <Button title="Cancelar" variant="secondary" onPress={onClose} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: "Poppins_700Bold", fontSize: 11, letterSpacing: 1.5 },
  title: { fontFamily: "Poppins_700Bold", fontSize: 26, marginTop: 4 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  announcementTitle: { fontFamily: "Poppins_600SemiBold", fontSize: 15, flex: 1 },
  announcementBody: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  announcementMeta: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalCard: { maxHeight: "88%", borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  fieldLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
});
