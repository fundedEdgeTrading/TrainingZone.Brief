import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme, radii, layout, useTabBarHeight } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { duration, easeOutSoft, useReducedMotion } from "@/theme/motion";
import { Icon } from "@/components/Icon";

type ToastTone = "neutral" | "good" | "critical";
type ToastMessage = { text: string; tone: ToastTone };

const ToastContext = createContext<{ show: (text: string, tone?: ToastTone) => void } | null>(null);

/**
 * Avisos efímeros de reserva/cancelación/guardado, sobre la barra de pestañas.
 *
 * E8-07: era el ÚNICO acuse de recibo de reservar, cancelar o guardar un
 * debrief, y no llevaba `accessibilityLiveRegion` ni `announceForAccessibility`
 * — un usuario de lector de pantalla no se enteraba de si algo se había
 * guardado. Los 2800 ms fijos también se retiran para los mensajes críticos
 * (WCAG 2.2.1: no autoocultar contenido que requiere tiempo para leerse), que
 * ahora se cierran a mano.
 */
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: ToastTone = "neutral") => {
    setMessage({ text, tone });
    AccessibilityInfo.announceForAccessibility(text);
    if (timer.current) clearTimeout(timer.current);
    // Un error necesita tiempo para leerse y una acción para cerrarlo: se
    // queda hasta que se descarta a mano, no hasta que expire un reloj.
    if (tone !== "critical") {
      timer.current = setTimeout(() => setMessage(null), 4200);
    }
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(null);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? <ToastHost message={message} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

function ToastHost({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // El toast vive fuera del navegador de pestañas, así que tiene que descontar
  // a mano el alto REAL de la barra (área segura incluida) para quedarse justo
  // encima de ella y no medio tapado.
  const tabBarHeight = useTabBarHeight();
  const [anim] = useState(() => new Animated.Value(reduced ? 1 : 0));
  const critical = message.tone === "critical";

  useEffect(() => {
    if (reduced) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: duration.base, easing: easeOutSoft, useNativeDriver: true }).start();
  }, [anim, message, reduced]);

  const accent = message.tone === "good" ? theme.good : critical ? theme.critical : theme.gold;

  return (
    <Animated.View
      // Un mensaje crítico admite el toque para cerrarlo; el resto sigue
      // siendo puramente informativo y no roba toques a lo que hay debajo.
      pointerEvents={critical ? "box-none" : "none"}
      style={[
        styles.host,
        {
          bottom: tabBarHeight + 14,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View
        testID="toast"
        style={[styles.toast, { backgroundColor: theme.sheet, borderColor: theme.border }]}
        // E8-07: la región viva tiene que EXISTIR antes de recibir contenido
        // (se monta ya con el texto dentro, no se le inserta después) y los
        // errores usan "assertive" (equivalente a role="alert"), el resto
        // "polite" (role="status").
        accessibilityLiveRegion={critical ? "assertive" : "polite"}
        accessibilityRole={critical ? "alert" : undefined}
      >
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={[typo.bodyMedium, { color: theme.text, flex: 1 }]} numberOfLines={2}>
          {message.text}
        </Text>
        {critical ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso" hitSlop={8} onPress={onDismiss}>
            <Icon name="close" size={16} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx ?? { show: () => {} };
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: layout.screenPadding, right: layout.screenPadding },
  toast: {
    borderRadius: radii.control,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
