import { Stack } from "expo-router";
import { push } from "@/theme/motion";

// Socios del entrenador: listado, ficha y el plan (mesociclo) de cada uno.
// Las pantallas de segundo nivel son `push` con volver en cabecera, como pide
// el rediseño; las acciones sobre una sesión siguen siendo hojas.
// Push a detalle: preset nativo a la duración del handoff (ver `push` en @/theme/motion).
export default function TrainerMembersLayout() {
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
