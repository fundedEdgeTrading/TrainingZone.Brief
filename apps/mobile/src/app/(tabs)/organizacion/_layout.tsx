import { Stack } from "expo-router";
import { push } from "@/theme/motion";

// D6 + D7: equipo de la organización y ficha con foto e imputación a centros.
// Push a detalle: preset nativo a la duración del handoff (ver `push` en @/theme/motion).
export default function StaffLayout() {
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
