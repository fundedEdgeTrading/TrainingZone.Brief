import { Stack } from "expo-router";
import { push } from "@/theme/motion";

// Cola de debrief: índice de sesiones terminadas sin semáforo. El detalle es el
// Session Brief (`/brief/[id]`), que es donde se pasa lista desde E3-07, así
// que aquí ya no cuelga ninguna pantalla más.
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
