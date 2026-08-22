import { Image, Text, View } from "react-native";
import { useTheme, radii } from "@/theme/theme";
import { fonts } from "@/theme/typography";
import { Icon } from "./Icon";

/**
 * Miniatura del producto. Sin foto (el cliente todavía no las ha aportado) se
 * pinta un marcador sobrio con la ratio recomendada en vez de un hueco vacío.
 */
export function ProductThumb({
  uri,
  size = 64,
  wide,
  label,
}: {
  uri?: string | null;
  size?: number;
  /** Slot ancho de la ficha de producto (D5), en vez de la miniatura cuadrada. */
  wide?: boolean;
  label?: string;
}) {
  const theme = useTheme();
  const style = wide ? { width: "100%" as const, height: 158 } : { width: size, height: size };

  if (uri) {
    return (
      <Image
        source={{ uri }}
        resizeMode="cover"
        style={[style, { borderRadius: radii.chip, backgroundColor: theme.surfaceAlt }]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[
        style,
        {
          borderRadius: radii.chip,
          backgroundColor: theme.surfaceAlt,
          borderWidth: 1,
          borderColor: theme.border,
          borderStyle: "dashed",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        },
      ]}
    >
      <Icon name="camera" size={wide ? 22 : 16} color={theme.textFaint} />
      {wide ? (
        <Text style={{ fontFamily: fonts.medium, fontSize: 10.5, letterSpacing: 1, color: theme.textFaint }}>
          {label ?? "FOTO DEL PRODUCTO · 1600 × 1000"}
        </Text>
      ) : null}
    </View>
  );
}
