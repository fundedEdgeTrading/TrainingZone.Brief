/**
 * E7-01 · Prueba del escenario principal: la infraestructura sirve para probar
 * la frontera de red de la app sin servidor y sin MSW.
 *
 * Prueba de paso lo que sostiene toda la app: `apiRequest` inyecta el Bearer,
 * refresca una sola vez ante un 401 y traduce todo fallo de red a castellano.
 */
import { apiRequest, ApiError, getStoredTokens, storeTokens } from "@/api/client";
import { meResponse, refreshResponse } from "@/test/fixtures";
import { lastRequest, reply, replyError, replyNetworkError, requests } from "@/test/server";
import type { MeResponse } from "@/api/types";

/** Ejecuta algo que debe fallar y devuelve el `ApiError`, ya estrechado. */
async function apiErrorFrom(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("Se esperaba un ApiError y la petición salió bien.");
}

describe("frontera de red de la app", () => {
  it("sirve una respuesta tipada y la devuelve ya desenvuelta", async () => {
    reply("GET /me", meResponse({ name: "Marina Castillo" }));

    const me = await apiRequest<MeResponse>("/me");

    expect(me.name).toBe("Marina Castillo");
    expect(me.member?.hasActiveMembership).toBe(true);
  });

  it("manda el Bearer guardado en SecureStore", async () => {
    await storeTokens({ accessToken: "access-token-1", refreshToken: "refresh-token-1" });
    reply("GET /me", meResponse());

    await apiRequest<MeResponse>("/me");

    expect(lastRequest("GET /me")?.authorization).toBe("Bearer access-token-1");
  });

  it("no manda Bearer cuando la petición es de las que no lo llevan", async () => {
    await storeTokens({ accessToken: "access-token-1", refreshToken: "refresh-token-1" });
    reply("POST /auth/login", { accessToken: "a", refreshToken: "b", user: meResponse() });

    await apiRequest("/auth/login", { method: "POST", body: { email: "a@b.c" }, skipAuth: true });

    expect(lastRequest("POST /auth/login")?.authorization).toBeNull();
  });

  it("ante un 401 refresca y reintenta UNA vez con el token nuevo", async () => {
    await storeTokens({ accessToken: "caducado", refreshToken: "refresh-token-1" });
    replyError("GET /me", "No autorizado", 401);
    reply("POST /auth/refresh", refreshResponse({ accessToken: "access-token-2" }));
    reply("GET /me", meResponse());

    await apiRequest<MeResponse>("/me");

    const meCalls = requests().filter((c) => c.path === "/me");
    expect(meCalls).toHaveLength(2);
    expect(meCalls[0].authorization).toBe("Bearer caducado");
    expect(meCalls[1].authorization).toBe("Bearer access-token-2");
    // Y el token nuevo queda guardado, no solo usado en el reintento.
    await expect(getStoredTokens()).resolves.toMatchObject({ accessToken: "access-token-2" });
  });

  it("si el refresco falla, borra los tokens y no deja una sesión a medias", async () => {
    await storeTokens({ accessToken: "caducado", refreshToken: "caducado" });
    replyError("GET /me", "No autorizado", 401);
    replyError("POST /auth/refresh", "Refresh inválido", 401);

    await expect(apiRequest<MeResponse>("/me")).rejects.toBeInstanceOf(ApiError);
    await expect(getStoredTokens()).resolves.toMatchObject({ accessToken: null, refreshToken: null });
  });

  it("conserva los detalles del error para que la pantalla pueda resolverlo", async () => {
    replyError("POST /auth/login", "Elige la organización con la que quieres entrar", 409, {
      organizations: [{ id: "org-1", name: "TRAINING ZONE", logoUrl: null }],
    });

    const error = await apiErrorFrom(() => apiRequest("/auth/login", { method: "POST", skipAuth: true }));

    expect(error.status).toBe(409);
    expect(error.details.organizations).toHaveLength(1);
  });

  it("traduce un fallo de red a castellano en vez de enseñar el error del motor", async () => {
    replyNetworkError("GET /me");

    const error = await apiErrorFrom(() => apiRequest<MeResponse>("/me"));

    expect(error.message).toBe("No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.");
    expect(error.status).toBe(0);
  });
});
