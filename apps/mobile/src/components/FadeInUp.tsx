import { useEffect, useRef, type PropsWithChildren } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";

// Réplica ligera de la animación de entrada `tz-fade-up` de la web (opacidad +
// subida de 10px), con Animated nativo: sin dependencias extra ni plugin de
// Babel, pensada para dar la misma sensación de "aparición escalonada".
export function FadeInUp({
  delay = 0,
  style,
  children,
}: PropsWithChildren<{ delay?: number; style?: StyleProp<ViewStyle> }>) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, opacity, translateY]);

  return <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>{children}</Animated.View>;
}
