import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useTheme, radii, layout, useTabBarHeight } from "@/theme/theme";
import { typo } from "@/theme/typography";
import { duration, easeOutSoft, useReducedMotion } from "@/theme/motion";

type ToastTone = "neutral" | "good" | "critical";
type ToastMessage = { text: string; tone: ToastTone };

const ToastContext = createContext<{ show: (text: string, tone?: ToastTone) => void } | null>(null);

/** Avisos efímeros de reserva/cancelación/guardado, sobre la barra de pestañas. */
export function ToastProvider({ children }: PropsWithChildren) {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((text: string, tone: ToastTone = "neutral") => {
    setMessage({ text, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 2800);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? <ToastHost message={message} /> : null}
    </ToastContext.Provider>
  );
}

function ToastHost({ message }: { message: ToastMessage }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // El toast vive fuera del navegador de pestañas, así que tiene que descontar
  // a mano el alto REAL de la barra (área segura incluida) para quedarse justo
  // encima de ella y no medio tapado.
  const tabBarHeight = useTabBarHeight();
  const [anim] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: duration.base, easing: easeOutSoft, useNativeDriver: true }).start();
  }, [anim, message, reduced]);

  const accent =
    message.tone === "good" ? theme.good : message.tone === "critical" ? theme.critical : theme.gold;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.host,
        {
          bottom: tabBarHeight + 14,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <View style={[styles.toast, { backgroundColor: theme.sheet, borderColor: theme.border }]}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <Text style={[typo.bodyMedium, { color: theme.text, flex: 1 }]} numberOfLines={2}>
          {message.text}
        </Text>
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
