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
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  "http://localhost:3000/api/mobile/v1";

const ACCESS_TOKEN_KEY = "tz_access_token";
const REFRESH_TOKEN_KEY = "tz_refresh_token";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

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

  const res = await fetch(`${API_URL}/auth/refresh`, {
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
    return fetch(`${API_URL}${path}`, {
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
    throw new ApiError(json && !json.ok ? json.error : "No se pudo conectar con el servidor.", res.status);
  }
  return json.data;
}
