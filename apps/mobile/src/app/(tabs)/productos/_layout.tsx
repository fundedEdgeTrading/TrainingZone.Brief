import { Stack } from "expo-router";
import { push } from "@/theme/motion";

// D4 + D5: productos a la venta y su ficha con foto.
// Push a detalle: preset nativo a la duración del handoff (ver `push` en @/theme/motion).
export default function ProductsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: push.in,
      }}
    />
  );
}
