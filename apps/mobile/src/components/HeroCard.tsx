import { useEffect, useState, type PropsWithChildren } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, radii } from "@/theme/theme";
import { easeOutSoft, heroEnter, useReducedMotion } from "@/theme/motion";

// Tarjeta "spotlight" en degradado tinta, con manchas doradas translúcidas —
// mismo tratamiento que el fondo `bg-brand-ink` + `tz-card-sheen` del panel
// del entrenador en web (src/app/(app)/trainer/page.tsx). El héroe se queda en
// tinta también en piel clara, como pide el handoff.
//
// La entrada es SUYA y no la del `FadeInUp` de la pantalla: es el bloque que
// contesta la pregunta con la que se abre la app (cuándo es la próxima sesión,
// cómo va el socio), así que entra un pelo más largo que una tarjeta normal y
// con una escala mínima que lo trae hacia delante en vez de solo subirlo. Por
// eso las pantallas NO deben envolverlo además en `FadeInUp`: sumaría dos
// entradas sobre el mismo elemento y se vería el rebote.
export function HeroCard({
  children,
  style,
  padding = 20,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; padding?: number }>) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduced) {
      anim.setValue(1);
      return;
    }
    const animation = Animated.timing(anim, {
      toValue: 1,
      duration: heroEnter.duration,
      delay: heroEnter.delay,
      easing: easeOutSoft,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [anim, reduced]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [heroEnter.translateY, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [heroEnter.fromScale, 1] }) },
        ],
      }}
    >
      <LinearGradient
        colors={theme.heroGradient}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.card, { padding }, style]}
      >
        <View pointerEvents="none" style={[styles.blob, styles.blobTop, { backgroundColor: theme.auroraGold }]} />
        <View pointerEvents="none" style={[styles.blob, styles.blobBottom, { backgroundColor: theme.auroraLinen }]} />
        <View style={styles.content}>{children}</View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.hero, overflow: "hidden" },
  blob: { position: "absolute", width: 220, height: 220, borderRadius: 110 },
  blobTop: { right: -70, top: -90 },
  blobBottom: { left: "20%", bottom: -110 },
  content: { position: "relative" },
});
