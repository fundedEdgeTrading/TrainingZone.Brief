import { Stack } from "expo-router";

// A2 y A3: catálogo y pago viven fuera de las tabs — mientras el socio no
// tenga bono vivo, esta pila sustituye al portal.
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}
