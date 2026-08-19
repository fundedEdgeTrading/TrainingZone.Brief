import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { duration, easeOutSoft, useReducedMotion } from "@/theme/motion";

// Réplica ligera de la animación de entrada `tz-fade-up` de la web (opacidad +
// subida de 10px), con Animated nativo. Si el sistema pide menos movimiento,
// el contenido aparece ya en su sitio.
export function FadeInUp({
  delay = 0,
  style,
  children,
}: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: duration.slow, delay, easing: easeOutSoft, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: duration.slow, delay, easing: easeOutSoft, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, opacity, translateY, reduced]);

  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}
