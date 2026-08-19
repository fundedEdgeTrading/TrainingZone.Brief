import type { PropsWithChildren, ReactElement } from "react";
import { ScrollView, StyleSheet, View, type RefreshControlProps } from "react-native";
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
}>;

export function ScreenContainer({ children, refreshControl, gap = layout.gap, flush, withTabBar = true }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

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
    >
      {children}
    </ScrollView>
  );
}

/** Contenedor fijo (sin scroll) para pantallas de flujo: login, pago, feedback. */
export function ScreenFrame({ children, padded = true }: PropsWithChildren<{ padded?: boolean }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
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
