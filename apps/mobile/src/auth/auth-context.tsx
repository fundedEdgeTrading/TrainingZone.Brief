import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { apiRequest, clearTokens, getStoredTokens, storeTokens, ApiError } from "@/api/client";
import type { LoginResponse, MeResponse } from "@/api/types";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: MeResponse };

type LoginOutcome = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
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

      // Esta primera versión solo implementa el portal del socio (F2); el
      // subconjunto de staff queda para F3.
      if (data.user.role !== "MEMBER") {
        return { ok: false, error: "Esta versión de la app solo está disponible para socios." };
      }

      await storeTokens(data);
      setState({ status: "signedIn", user: data.user });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof ApiError ? err.message : "No se pudo iniciar sesión." };
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

  const value = useMemo(() => ({ state, login, logout }), [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
