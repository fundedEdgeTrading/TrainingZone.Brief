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
  /** La barra de pestañas flota sobre el contenido: hay que dejarle hueco. */
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
          paddingBottom: (withTabBar ? layout.tabBarHeight + 34 : 32) + insets.bottom,
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
 * `withTabBar` deja hueco a la barra de pestañas cuando la pantalla vive dentro
 * del grupo (tabs) — si no, el pie de la pantalla queda debajo de la barra.
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
          paddingBottom: insets.bottom + (withTabBar ? layout.tabBarHeight + 10 : 0),
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
