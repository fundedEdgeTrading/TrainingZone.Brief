import type { PropsWithChildren, ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, radii, layout } from "@/theme/theme";
import { typo } from "@/theme/typography";

/**
 * Bottom sheet del handoff: fondo atenuado, hoja de radio 26 con asa de 44 × 4
 * y borde superior. El contenido va en un ScrollView para que un teclado
 * abierto no lo recorte.
 */
export function Sheet({
  visible,
  onClose,
  kicker,
  title,
  children,
  footer,
}: PropsWithChildren<{
  visible: boolean;
  onClose: () => void;
  kicker?: string;
  title?: string;
  footer?: ReactNode;
}>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cerrar" onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.sheet, borderColor: theme.border, paddingBottom: insets.bottom + 16 }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          {kicker ? <Text style={[typo.kicker, { color: theme.goldText, marginTop: 6 }]}>{kicker}</Text> : null}
          {title ? <Text style={[styles.title, { color: theme.text }]}>{title}</Text> : null}
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,11,10,.62)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 10,
  },
  handle: { width: 44, height: 4, borderRadius: 2, alignSelf: "center" },
  title: { fontFamily: "Poppins_700Bold", fontSize: 22, marginTop: 4 },
  content: { gap: 12, paddingTop: 14, paddingBottom: 8 },
});
