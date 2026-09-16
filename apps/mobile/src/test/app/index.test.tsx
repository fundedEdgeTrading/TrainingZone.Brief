/**
 * Arranque de la app: qué pasa con la sesión guardada.
 *
 * El fallo que cierra esta batería: al abrir la app se lee `/me`, y CUALQUIER
 * error de esa llamada borraba los tokens y mandaba a login. Un túnel, un
 * ascensor o un servidor lento en ese instante te echaba de una sesión
 * perfectamente viva y te hacía teclear la contraseña otra vez. Un fallo de red
 * no es una sesión inválida: solo se cierra la sesión cuando el servidor
 * RESPONDE que la identidad ya no sirve.
 */
import { meResponse } from "@/test/fixtures";
import { fireEvent, renderWithProviders, screen, waitFor } from "@/test/render";
import { reply, replyError, replyNetworkError, requests } from "@/test/server";

import Index from "@/app/index";

jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}));

/** Tokens ya guardados: la app se abre con sesión, como en el uso normal. */
function withStoredSession() {
  const secureStore = jest.requireMock("expo-secure-store") as { __store: Map<string, string> };
  secureStore.__store.set("tz_access_token", "access-token-1");
  secureStore.__store.set("tz_refresh_token", "refresh-token-1");
  return secureStore.__store;
}

describe("Arranque · sesión guardada", () => {
  it("sin conexión, conserva los tokens y ofrece reintentar en vez de mandar a login", async () => {
    const store = withStoredSession();
    replyNetworkError("GET /me");

    renderWithProviders(<Index />);

    expect(await screen.findByText("Sin conexión")).toBeOnTheScreen();
    expect(screen.getByText("Reintentar")).toBeOnTheScreen();
    // Lo que de verdad se protege: la sesión sigue ahí cuando vuelva la red.
    expect(store.get("tz_refresh_token")).toBe("refresh-token-1");
  });

  it("al reintentar con red, entra sin volver a pedir la contraseña", async () => {
    withStoredSession();
    replyNetworkError("GET /me");
    reply("GET /me", meResponse());

    renderWithProviders(<Index />);

    fireEvent.press(await screen.findByText("Reintentar"));

    await waitFor(() => expect(screen.queryByText("Sin conexión")).not.toBeOnTheScreen());
    expect(requests().filter((call) => call.path === "/me")).toHaveLength(2);
  });

  it("si el servidor rechaza la identidad, ahí sí se cierra la sesión", async () => {
    const store = withStoredSession();
    replyError("GET /me", "Sesión no válida.", 401);
    replyError("POST /auth/refresh", "Refresh token caducado.", 401);

    renderWithProviders(<Index />);

    await waitFor(() => expect(store.get("tz_refresh_token")).toBeUndefined());
    expect(screen.queryByText("Sin conexión")).not.toBeOnTheScreen();
  });
});
