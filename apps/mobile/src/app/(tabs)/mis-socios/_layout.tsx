import { Stack } from "expo-router";

// Socios del entrenador: listado, ficha y el plan (mesociclo) de cada uno.
// Las pantallas de segundo nivel son `push` con volver en cabecera, como pide
// el rediseño; las acciones sobre una sesión siguen siendo hojas.
export default function TrainerMembersLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}
