import { useEffect, useState, type PropsWithChildren, type ReactElement } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type RefreshControlProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, layout } from "@/theme/theme";
import { authEnter, easeOutSoft, useReducedMotion } from "@/theme/motion";
import { useAuth } from "@/auth/auth-context";

type Props = PropsWithChildren<{
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Separación entre bloques (11-14 px del handoff). */
  gap?: number;
  /** Sin padding lateral: para pantallas que sangran la timeline o el calendario. */
  flush?: boolean;
  /**
   * La pantalla vive dentro del grupo (tabs). La barra ya no flota —está fijada
   * al borde y el navegador le resta su alto a la pantalla—, así que aquí solo
   * decide si hay que reservar el área segura inferior: dentro de las tabs se
   * la queda la propia barra, fuera (login, onboarding) la reserva la pantalla.
   */
  withTabBar?: boolean;
  /** Scroll infinito: se llama al acercarse al final de la lista. */
  onEndReached?: () => void;
  /**
   * Hueco extra al pie, para las pantallas que pintan algo FLOTANTE encima del
   * scroll (el botón de «Nueva sesión» de la agenda). Sin él, ese botón tapa la
   * última tarjeta de la lista y no hay forma de llegar a ella.
   */
  footerSpace?: number;
  /**
   * `"auth"` marca esta pantalla como aterrizaje del login: al llegar, se
   * disuelve entera con un pelo de escala (420 ms) en vez de aparecer puesta.
   * Es la única transición de la app que cruza de un mundo a otro —de la puerta
   * a dentro—, y por eso no se parece a la entrada de una tarjeta.
   *
   * Solo se ejecuta si se viene de escribir la contraseña (`justSignedIn` del
   * `AuthProvider`, que esta pantalla consume): volver a la pestaña de inicio
   * más tarde no es una llegada y no la repite.
   */
  enter?: "auth";
}>;

export function ScreenContainer({
  children,
  refreshControl,
  gap = layout.gap,
  flush,
  withTabBar = true,
  onEndReached,
  footerSpace = 0,
  enter,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { justSignedIn, consumeJustSignedIn } = useAuth();

  // La bandera se lee en el PRIMER render y se congela: consumirla apaga
  // `justSignedIn` a mitad de la animación, y sin congelarla la pantalla se
  // quedaría a medio disolver.
  const [authEntry] = useState(() => enter === "auth" && justSignedIn);
  const [anim] = useState(() => new Animated.Value(authEntry ? 0 : 1));

  useEffect(() => {
    if (!authEntry) return;
    consumeJustSignedIn();
    if (reduced) {
      anim.setValue(1);
      return;
    }
    const animation = Animated.timing(anim, {
      toValue: 1,
      duration: authEnter.duration,
      easing: easeOutSoft,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [authEntry, reduced, anim, consumeJustSignedIn]);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!onEndReached) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 240) onEndReached();
  }

  const scroll = (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        {
          paddingTop: insets.top + 14,
          paddingHorizontal: flush ? 0 : layout.screenPadding,
          paddingBottom: (withTabBar ? 28 : 32 + insets.bottom) + footerSpace,
          gap,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
      onScroll={onEndReached ? handleScroll : undefined}
      scrollEventThrottle={onEndReached ? 200 : undefined}
    >
      {children}
    </ScrollView>
  );

  if (!authEntry) return scroll;

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: anim,
        transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [authEnter.fromScale, 1] }) }],
      }}
    >
      {scroll}
    </Animated.View>
  );
}

/**
 * Contenedor fijo (sin scroll) para pantallas de flujo: pago, feedback, fichas
 * de producto y de equipo. `withTabBar` marca que la pantalla vive dentro del
 * grupo (tabs): allí el área segura inferior ya la ocupa la barra, así que
 * reservarla otra vez dejaría el pie de la pantalla flotando sobre un hueco.
 *
 * Va envuelto en `KeyboardAvoidingView` porque estas son justo las pantallas
 * con formulario largo —la nota del feedback, el precio del producto, la ficha
 * de equipo— y en iOS el teclado NO aparta nada por su cuenta: tapaba a la vez
 * el campo que se estaba escribiendo y el botón de guardar del pie. Es el mismo
 * arreglo que ya llevaba `Sheet`.
 *
 * El relleno va en la vista interior a propósito: `behavior="padding"` escribe
 * su propio `paddingBottom` en el estilo del `KeyboardAvoidingView`, y con el
 * teclado cerrado ese valor es 0 — puesto ahí, se comería el área segura.
 */
export function ScreenFrame({
  children,
  padded = true,
  withTabBar = false,
}: PropsWithChildren<{ padded?: boolean; withTabBar?: boolean }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingBottom: withTabBar ? 10 : insets.bottom,
            paddingHorizontal: padded ? layout.screenPadding : 0,
          },
        ]}
      >
        {children}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
