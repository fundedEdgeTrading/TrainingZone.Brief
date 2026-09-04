import { Stack } from "expo-router";
import { push } from "@/theme/motion";

// D2 + D3: listado de socios y su ficha con calendario.
// Push a detalle: preset nativo a la duración del handoff (ver `push` en @/theme/motion).
export default function MembersLayout() {
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
