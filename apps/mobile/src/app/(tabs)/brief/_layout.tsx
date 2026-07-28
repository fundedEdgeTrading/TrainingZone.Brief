import { Stack } from "expo-router";
import { useTheme } from "@/theme/theme";

// Sub-stack dentro del tab "Session Brief": index.tsx (lista) → [id].tsx (detalle).
export default function BriefLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerTitleStyle: { fontFamily: "Poppins_600SemiBold" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Session Brief" }} />
      <Stack.Screen name="[id]" options={{ title: "Sesión" }} />
    </Stack>
  );
}
