import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { apiRequest, clearTokens, getStoredTokens, storeTokens, ApiError } from "@/api/client";
import type { LoginResponse, MeResponse, Role } from "@/api/types";

const SUPPORTED_ROLES: Role[] = [
  "MEMBER",
  "TRAINER",
  "TRAINER_ADMIN",
  "OWNER",
  "CENTER_DIRECTOR",
  "PLATFORM_ADMIN",
];

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: MeResponse };

type LoginOutcome = { ok: true; user: MeResponse } | { ok: false; error: string };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  /** Vuelve a leer /me: lo usa el gate de compra al volver del pago. */
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    (async () => {
      const { refreshToken } = await getStoredTokens();
      if (!refreshToken) {
        setState({ status: "signedOut" });
        return;
      }
      try {
        const me = await apiRequest<MeResponse>("/me");
        setState({ status: "signedIn", user: me });
      } catch {
        await clearTokens();
        setState({ status: "signedOut" });
      }
    })();
  }, []);

  async function login(email: string, password: string): Promise<LoginOutcome> {
    try {
      const data = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: { email, password },
        skipAuth: true,
      });

      // F1 QA: Entrenador Admin daba error de "rol no soportado" pese a tener
      // tabs propias en TABS_BY_ROLE (mismo subconjunto que Entrenador) — bug
      // corregido aquí. Recepción y RRHH sí tienen tabs definidas en
      // TABS_BY_ROLE, pero de momento no se activan: sus pantallas de gestión
      // (aforo, avisos globales) aún no existen en la app, así que abrirles el
      // login solo llevaría a una barra de tabs sin nada útil detrás. Se deja
      // documentado aquí como decisión de F1: quedan fuera de SUPPORTED_ROLES
      // hasta que haya una historia que las complete.
      if (!SUPPORTED_ROLES.includes(data.user.role)) {
        return { ok: false, error: "Tu rol todavía no tiene una versión de la app móvil." };
      }

      await storeTokens(data);
      setState({ status: "signedIn", user: data.user });
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "No se pudo iniciar sesión." };
    }
  }

  async function refresh() {
    try {
      const me = await apiRequest<MeResponse>("/me");
      setState({ status: "signedIn", user: me });
    } catch {
      // Un fallo puntual de red no debe echar al usuario de la app: se
      // conserva el estado actual y el siguiente 401 real ya lo resolverá
      // el refresh de token del cliente de API.
    }
  }

  async function logout() {
    const { refreshToken } = await getStoredTokens();
    if (refreshToken) {
      await apiRequest("/auth/logout", { method: "POST", body: { refreshToken }, skipAuth: true }).catch(() => {});
    }
    await clearTokens();
    setState({ status: "signedOut" });
  }

  const value = useMemo(() => ({ state, login, logout, refresh }), [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
