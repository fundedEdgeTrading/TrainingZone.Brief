import { Stack } from "expo-router";
import { push } from "@/theme/motion";

// Feedback 1-10 (C4): índice de sesiones a puntuar + flujo socio a socio.
// Push a detalle: preset nativo a la duración del handoff (ver `push` en @/theme/motion).
export default function FeedbackLayout() {
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
