import type { PropsWithChildren, ReactElement } from "react";
import { ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type RefreshControlProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, layout } from "@/theme/theme";

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
}>;

export function ScreenContainer({ children, refreshControl, gap = layout.gap, flush, withTabBar = true, onEndReached }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!onEndReached) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 240) onEndReached();
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        {
          paddingTop: insets.top + 14,
          paddingHorizontal: flush ? 0 : layout.screenPadding,
          paddingBottom: withTabBar ? 28 : 32 + insets.bottom,
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
}

/**
 * Contenedor fijo (sin scroll) para pantallas de flujo: login, pago, feedback.
 * `withTabBar` marca que la pantalla vive dentro del grupo (tabs): allí el área
 * segura inferior ya la ocupa la barra, así que reservarla otra vez dejaría el
 * pie de la pantalla flotando sobre un hueco vacío.
 */
export function ScreenFrame({
  children,
  padded = true,
  withTabBar = false,
}: PropsWithChildren<{ padded?: boolean; withTabBar?: boolean }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top,
          paddingBottom: withTabBar ? 10 : insets.bottom,
          paddingHorizontal: padded ? layout.screenPadding : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
