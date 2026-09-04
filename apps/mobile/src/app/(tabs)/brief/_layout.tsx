import { Stack } from "expo-router";

// Sub-stack dentro del tab "Session Brief": index.tsx (lista) → [id].tsx (detalle).
//
// Sin cabecera nativa, como el resto de sub-stacks. Con ella, las dos pantallas
// salían con DOS cabeceras —la del navegador («Session Brief» / «Sesión») y la
// propia `ScreenHeader` con su flecha— y encima con el hueco del área segura
// contado dos veces, porque `ScreenContainer` reserva `insets.top` por su
// cuenta y el navegador ya lo había reservado antes.
export default function BriefLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}
