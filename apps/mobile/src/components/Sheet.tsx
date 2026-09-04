import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, radii, layout } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { easeInOutSoft, easeOutSoft, sheetSlide, useReducedMotion } from "@/theme/motion";

/**
 * Bottom sheet del handoff: fondo atenuado, hoja de radio 26 con asa de 44 × 4
 * y borde superior.
 *
 * La hoja está anclada abajo, así que un teclado abierto la tapaba ENTERA: el
 * ScrollView interior deja llegar a todo el formulario, pero no aparta la hoja
 * del teclado. De ahí el `KeyboardAvoidingView`, que es lo que hace usable
 * escribir el título de una sesión, la nota de un descarte o una tarea nueva.
 *
 * La animación es PROPIA y no la del `Modal` (`animationType="slide"`), porque
 * esa solo sabe hacer lo mismo en los dos sentidos y aquí la salida tiene que
 * ser más corta y más seca que la entrada: sube en 280 ms con `easeOutSoft` y
 * baja en 180 ms con `easeInOutSoft`. Además el `Modal` se desmonta al TERMINAR
 * la bajada, no al pedirla: con la animación de serie, cerrar la hoja la hacía
 * desaparecer de golpe.
 */
export function Sheet({
  visible,
  onClose,
  kicker,
  title,
  children,
  footer,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  kicker?: string;
  title?: string;
  footer?: ReactNode;
}>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { height: screenHeight } = useWindowDimensions();

  const [anim] = useState(() => new Animated.Value(visible ? 1 : 0));
  /** La hoja ya no está pedida, pero sigue montada mientras baja. */
  const [closing, setClosing] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);

  // Ajuste de estado en render (el patrón de React para reaccionar a un cambio
  // de prop): al dejar de estar pedida, la hoja entra en «bajando» y se queda
  // montada hasta que la animación termina.
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) setClosing(true);
  }

  useEffect(() => {
    if (!visible && !closing) return;
    const opening = visible;
    const animation = Animated.timing(anim, {
      toValue: opening ? 1 : 0,
      // Con «menos movimiento» la hoja no se desliza: aparece y desaparece en
      // su sitio, que es lo que hace el resto de la app.
      duration: reduced ? 0 : opening ? sheetSlide.in : sheetSlide.out,
      easing: opening ? easeOutSoft : easeInOutSoft,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !opening) setClosing(false);
    });
    return () => animation.stop();
  }, [visible, closing, reduced, anim]);

  if (!visible && !closing) return null;

  // La hoja arranca desplazada una pantalla entera hacia abajo, no su propia
  // altura: es un número —lo que el hilo nativo sabe interpolar, a diferencia
  // de un porcentaje— y no hace falta medirla con `onLayout`, que llega un
  // fotograma tarde y la enseñaría a medio colocar. Como la hoja nunca pasa del
  // 90 % del alto, partir de ahí la deja siempre fuera de cuadro.
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [screenHeight, 0] });
  // El fondo atenuado entra y sale un poco antes que la hoja (200 / 160 ms):
  // así el velo ya está puesto cuando la hoja llega, y no queda flotando negro
  // cuando se ha ido.
  const scrimOpacity = anim.interpolate({
    inputRange: [0, visible ? sheetSlide.scrimIn / sheetSlide.in : sheetSlide.scrimOut / sheetSlide.out, 1],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrimOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.sheet,
              borderColor: theme.border,
              paddingBottom: insets.bottom + 16,
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {kicker ? <Text style={[typo.kicker, { color: theme.goldText, marginTop: 6 }]}>{kicker}</Text> : null}
          {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-end" },
  scrim: { backgroundColor: "rgba(11,11,10,.62)" },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 10,
  },
  handle: { width: 44, height: 4, borderRadius: 2, alignSelf: "center" },
  title: { fontFamily: "Poppins_700Bold", fontSize: 22, marginTop: 4 },
  content: { gap: 12, paddingTop: 14, paddingBottom: 8 },
});
