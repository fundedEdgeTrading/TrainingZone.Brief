/**
 * E5-15 · Desde «Mi cuenta» se llega al borrado.
 *
 * App Store Review 5.1.1(v) no pide que exista la pantalla: pide que se llegue
 * a ella desde dentro de la app. Y pide que sea del socio: el resto de roles
 * gestiona su baja por RRHH, no por aquí.
 */
import { router } from "expo-router";

import { storeTokens } from "@/api/client";
import { meResponse } from "@/test/fixtures";
import { renderWithProviders, fireEvent, screen } from "@/test/render";
import { reply } from "@/test/server";

import AccountScreen from "@/app/(tabs)/perfil";

jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => false, replace: jest.fn() } }));

async function renderAsMember(role: "MEMBER" | "TRAINER" = "MEMBER") {
  reply("GET /me", meResponse({ role, member: role === "MEMBER" ? undefined : null }));
  await storeTokens({ accessToken: "a", refreshToken: "r" });
  renderWithProviders(<AccountScreen />);
}

describe("Mi cuenta · ruta in-app al borrado (E5-15)", () => {
  it("el socio tiene la entrada, y dice qué va a encontrar", async () => {
    await renderAsMember();

    expect(await screen.findByText("Borrar mi cuenta")).toBeOnTheScreen();
    expect(screen.getByText("Qué se borra, qué se conserva y en cuánto tiempo")).toBeOnTheScreen();

    fireEvent.press(screen.getByText("Borrar mi cuenta"));
    expect(router.push).toHaveBeenCalledWith("/borrar-cuenta");
  });

  it("va en su propio bloque, no mezclada con «Mis bonos»", async () => {
    await renderAsMember();

    // El bloque existe y se llama por lo que contiene. Es el hueco donde D3
    // (E10-19) cuelga los enlaces legales sin rehacer la pantalla.
    expect(await screen.findByText("TUS DATOS Y TU CUENTA")).toBeOnTheScreen();
  });

  it("quien no es socio no la ve: su baja no se pide por aquí", async () => {
    await renderAsMember("TRAINER");

    expect(await screen.findByText("Cerrar sesión")).toBeOnTheScreen();
    expect(screen.queryByText("Borrar mi cuenta")).not.toBeOnTheScreen();
  });
});
