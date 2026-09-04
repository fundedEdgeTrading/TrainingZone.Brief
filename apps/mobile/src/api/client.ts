import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import type { RefreshResponse } from "./types";

// F1 (docs/APP_MOVIL_NATIVA_PLAN.md §5.2): wrapper fetch con inyección de
// Bearer, refresh automático en 401, y tokens SIEMPRE en SecureStore
// (Keychain/Keystore) — nunca AsyncStorage.
// F8: el emulador se prueba contra el entorno desplegado, no contra localhost —
// es ahí donde aparecen los fallos de URL absoluta y de certificado. Manda
// `EXPO_PUBLIC_API_URL` (Expo la inlinea en el bundle) para no tener que editar
// `app.json`; sin ella se cae al valor de siempre para el desarrollo en local.
//
// "localhost" solo apunta al servidor de desarrollo cuando la app corre en un
// simulador/emulador en la misma máquina. En un dispositivo físico con Expo
// Go (p.ej. probando desde el iPhone), "localhost" es el propio teléfono, así
// que la petición nunca llega a nadie y se queda colgada hasta que el
// sistema operativo agota su timeout — de ahí el "no se pudo iniciar sesión"
// tras una espera larga aunque las credenciales sean correctas. Como
// fallback de desarrollo, derivamos el host del propio Metro bundler
// (Constants.expoConfig.hostUri, p.ej. "192.168.1.23:8081"), que sí es
// alcanzable desde el dispositivo.
function devApiUrlFallback(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  const lanHost = hostUri?.split(":")[0];
  if (lanHost && lanHost !== "localhost") {
    return `http://${lanHost}:3000/api/mobile/v1`;
  }
  return "http://localhost:3000/api/mobile/v1";
}

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  devApiUrlFallback();

// Sin esto, un servidor inalcanzable (p.ej. el caso de "localhost" de arriba)
// deja el fetch colgado decenas de segundos con el spinner de "Entrar" antes
// de fallar: el timeout lo hace fallar rápido y con un mensaje claro.
const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError("No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.", 0);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

const ACCESS_TOKEN_KEY = "tz_access_token";
const REFRESH_TOKEN_KEY = "tz_refresh_token";

export class ApiError extends Error {
  status: number;
  /**
   * Campos extra que acompañan al error y que el cliente necesita para poder
   * resolverlo: hoy, la lista de organizaciones del 409 del login. Sin esto la
   * app recibía «Elige la organización con la que quieres entrar» y no tenía
   * ninguna organización que ofrecer, así que quien tuviera más de una membresía
   * no podía entrar de ninguna manera.
   */
  details: Record<string, unknown>;
  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

type ApiEnvelope<T> = { ok: true; data: T } | ({ ok: false; error: string } & Record<string, unknown>);

export async function getStoredTokens() {
  const [accessToken, refreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return { accessToken, refreshToken };
}

export async function storeTokens(tokens: { accessToken: string; refreshToken: string }) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
  ]);
  accessTokenCache = tokens.accessToken;
}

export async function clearTokens() {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)]);
  accessTokenCache = null;
}

// Cache en memoria del access token para no leer el Keychain en cada
// petición; se hidrata perezosamente desde SecureStore en la primera llamada.
let accessTokenCache: string | null | undefined;
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = await getStoredTokens();
  if (!refreshToken) return null;

  const res = await fetchWithTimeout(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<RefreshResponse> | null;
  if (!res.ok || !json?.ok) {
    await clearTokens();
    return null;
  }

  await storeTokens(json.data);
  return json.data.accessToken;
}

type RequestOptions = { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; skipAuth?: boolean };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (accessTokenCache === undefined) {
    accessTokenCache = (await getStoredTokens()).accessToken;
  }

  const doFetch = (token: string | null) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetchWithTimeout(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let res = await doFetch(options.skipAuth ? null : accessTokenCache ?? null);

  if (res.status === 401 && !options.skipAuth) {
    refreshPromise ??= refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
    const newToken = await refreshPromise;
    if (newToken) {
      accessTokenCache = newToken;
      res = await doFetch(newToken);
    }
  }

  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !json || !json.ok) {
    const { ok: _ok, error: _error, ...details } = (json ?? {}) as Record<string, unknown>;
    throw new ApiError(json && !json.ok ? json.error : "No se pudo conectar con el servidor.", res.status, details);
  }
  return json.data;
}
