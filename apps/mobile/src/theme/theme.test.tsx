/**
 * E13-02 (D-M5): la app lee `User.theme` del servidor en vez de decidir solo
 * con `useColorScheme()`. Sin sesión (login, splash) sigue el sistema, como
 * siempre.
 */
import { Text } from "react-native";

import { storeTokens } from "@/api/client";
import { AuthProvider } from "@/auth/auth-context";
import { useTheme } from "@/theme/theme";
import { meResponse } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

jest.mock("react-native", () => {
  // Mutar UNA propiedad, nunca `{...actual}`: el spread lee todas las
  // propiedades del módulo, y varias son getters perezosos (FlatList,
  // Clipboard, DevMenu…) que revientan fuera de un binario nativo real.
  const actual = jest.requireActual("react-native");
  actual.useColorScheme = () => "light";
  return actual;
});

function ThemeProbe() {
  const theme = useTheme();
  return <Text>modo:{theme.mode}</Text>;
}

describe("useTheme", () => {
  it("con sesión, la preferencia explícita del servidor manda sobre el sistema", async () => {
    reply("GET /me", meResponse({ theme: "DARK" }));
    await storeTokens({ accessToken: "a", refreshToken: "r" });

    renderWithProviders(
      <AuthProvider>
        <ThemeProbe />
      </AuthProvider>,
    );

    // El sistema está en "light" (mockeado arriba); el servidor dice "DARK".
    expect(await screen.findByText("modo:dark")).toBeOnTheScreen();
  });

  it("sin sesión, sigue el sistema", async () => {
    renderWithProviders(
      <AuthProvider>
        <ThemeProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText("modo:light")).toBeOnTheScreen();
  });
});
