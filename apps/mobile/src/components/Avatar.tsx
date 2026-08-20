import { Image, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/theme";
import { fonts } from "@/theme/typography";

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Foto circular del equipo/socio. Con foto: `cover` con el foco arriba (las
 * fotos del cliente están recortadas de medio cuerpo). Sin foto: iniciales
 * sobre `surfaceAlt` con el dorado de marca.
 */
export function Avatar({
  name,
  uri,
  size = 36,
  tone = "gold",
  style,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  tone?: "gold" | "neutral";
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const color = tone === "gold" ? theme.goldText : theme.textSecondary;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: theme.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={{ width: size, height: size }}
          // Foco arriba: en un recorte circular la cara no debe quedar cortada.
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={{ fontFamily: fonts.bold, fontSize: Math.max(9, size * 0.36), color, letterSpacing: 0.3 }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
