import { View, StyleSheet, type ViewProps } from "react-native";
import { useTheme, radii } from "@/theme/theme";

type Props = ViewProps & { elevated?: boolean };

export function Card({ style, elevated, ...props }: Props) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadowColor,
          shadowOpacity: elevated ? 1 : 0.6,
          shadowRadius: elevated ? 18 : 10,
          shadowOffset: { width: 0, height: elevated ? 10 : 4 },
          elevation: elevated ? 6 : 2,
        },
        style,
      ]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 18, gap: 8 },
});
