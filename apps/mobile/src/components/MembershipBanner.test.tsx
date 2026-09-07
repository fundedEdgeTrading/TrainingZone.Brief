/**
 * E5-14 (D-M3): la banda de compra sustituye al muro — solo aparece sin bono
 * vivo, y nunca ocupa la pantalla entera.
 */
import { Text } from "react-native";

import { storeTokens } from "@/api/client";
import { AuthProvider, useAuth } from "@/auth/auth-context";
import { MembershipBanner } from "@/components/MembershipBanner";
import { meResponse } from "@/test/fixtures";
import { renderWithProviders, screen } from "@/test/render";
import { reply } from "@/test/server";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

/** Se resuelve /me antes de afirmar sobre lo que pinta (o no) la banda. */
function AuthReady() {
  const { state } = useAuth();
  return <Text>estado:{state.status}</Text>;
}

describe("MembershipBanner", () => {
  it("se muestra cuando el socio no tiene bono activo", async () => {
    reply(
      "GET /me",
      meResponse({ role: "MEMBER", member: { id: "m1", firstName: "Ana", centerName: "TZ", hasActiveMembership: false } }),
    );
    await storeTokens({ accessToken: "a", refreshToken: "r" });

    renderWithProviders(
      <AuthProvider>
        <MembershipBanner />
      </AuthProvider>,
    );

    expect(await screen.findByText("Renovar")).toBeOnTheScreen();
  });

  it("no se muestra con bono activo", async () => {
    reply(
      "GET /me",
      meResponse({ role: "MEMBER", member: { id: "m1", firstName: "Ana", centerName: "TZ", hasActiveMembership: true } }),
    );
    await storeTokens({ accessToken: "a", refreshToken: "r" });

    renderWithProviders(
      <AuthProvider>
        <AuthReady />
        <MembershipBanner />
      </AuthProvider>,
    );

    await screen.findByText("estado:signedIn");
    expect(screen.queryByText("Renovar")).not.toBeOnTheScreen();
  });
});
