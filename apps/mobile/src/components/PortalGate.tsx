import { useState } from "react";
import { Modal, Pressable, Text, View, StyleSheet } from "react-native";
import { useBirthdayGreeting, useDismissBirthdayGreeting, usePendingAssessment } from "@/api/queries";
import { useTheme, radii } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { Button } from "./Button";

/**
 * Los dos avisos de entrada del socio (F8), espejo del layout del portal web:
 * felicitación de cumpleaños (F5 §6.3) y valoración vencida (F4 §5.3). Se
 * resuelven contra los mismos endpoints que la web, así que la regla vive en un
 * único sitio y no se puede desincronizar.
 *
 * Prioridad idéntica a la del portal: primero felicitar y solo después reclamar
 * la valoración. Y el aviso de valoración **siempre con salida**: dejar al socio
 * encerrado fuera de su propia reserva es peor problema que la valoración que
 * falta.
 */
export function PortalGate({ isMember }: { isMember: boolean }) {
  const greetingQuery = useBirthdayGreeting(isMember);
  const assessmentQuery = usePendingAssessment(isMember);
  const dismissGreeting = useDismissBirthdayGreeting();
  const [greetingClosed, setGreetingClosed] = useState(false);
  const [gateClosed, setGateClosed] = useState(false);
  const theme = useTheme();

  const greeting = greetingQuery.data?.greeting ?? null;
  const assessment = assessmentQuery.data?.assessment ?? null;

  const showGreeting = !!greeting && !greetingClosed;
  const showGate = !showGreeting && !!assessment && !gateClosed;

  function closeGreeting() {
    setGreetingClosed(true);
    // El descarte se persiste en el servidor (`resolvedAt` de la notificación),
    // no en el estado del componente: cerrar la app no lo devuelve a la vida.
    // Optimista: si la petición falla, reaparece en la siguiente entrada.
    if (greeting) dismissGreeting.mutate(greeting.id);
  }

  if (showGreeting) {
    return (
      <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={closeGreeting}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={closeGreeting} />
          <View style={[styles.card, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
            <View style={[styles.hero, { backgroundColor: theme.ink }]}>
              <Text style={styles.emoji}>🎉</Text>
              <Text style={[typo.screenTitleTight, styles.heroTitle, { color: theme.inkText }]}>{greeting!.title}</Text>
            </View>
            <View style={styles.body}>
              <Text style={[typo.body, styles.paragraph, { color: theme.textSecondary }]}>{greeting!.body}</Text>
              <Button title="¡Gracias!" onPress={closeGreeting} />
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  if (!showGate) return null;

  const dueDate = new Date(assessment!.dueDate).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setGateClosed(true)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[typo.kicker, { color: theme.goldText }]}>Valoración pendiente</Text>
            <Text style={[typo.cardTitle, styles.headerTitle, { color: theme.text }]}>{assessment!.label}</Text>
          </View>
          <View style={styles.body}>
            <Text style={[typo.body, styles.paragraph, { color: theme.textSecondary }]}>
              Te tocaba el {dueDate}. La pasas con tu entrenador en la próxima sesión: son unos minutos y es lo que le
              permite ver cómo has evolucionado de verdad, en vez de por sensación.
            </Text>
            <Button title="Entendido" onPress={() => setGateClosed(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "rgba(20,20,18,.6)" },
  card: { width: "100%", maxWidth: 420, borderRadius: radii.hero, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  hero: { paddingHorizontal: 26, paddingTop: 30, paddingBottom: 26, alignItems: "center" },
  emoji: { fontSize: 42, lineHeight: 48 },
  heroTitle: { marginTop: 10, textAlign: "center" },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  headerTitle: { marginTop: 6 },
  body: { paddingHorizontal: 24, paddingVertical: 22, gap: 18 },
  paragraph: { lineHeight: 20 },
});
