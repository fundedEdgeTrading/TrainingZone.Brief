import type { PropsWithChildren, ReactElement } from "react";
import { ScrollView, StyleSheet, type RefreshControlProps } from "react-native";
import { useTheme } from "@/theme/theme";

type Props = PropsWithChildren<{ refreshControl?: ReactElement<RefreshControlProps> }>;

export function ScreenContainer({ children, refreshControl }: Props) {
  const theme = useTheme();
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
});
