import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { apiRequest, clearTokens, getStoredTokens, storeTokens, ApiError } from "@/api/client";
import type { LoginOrganization, LoginResponse, MeResponse } from "@/api/types";

// E13-01 (D-M4): el login ya no bloquea por rol. Antes se rechazaba aquí a
// quien tuviera un rol sin pestañas, con un error genérico de "tu rol
// todavía no tiene versión de la app". Ahora TODOS los roles inician sesión;
// es `(tabs)/_layout.tsx` (`isAppSupportedRole`) quien decide, tras entrar,
// si el rol usa las pestañas de socio/entrenador o ve la pantalla que le
// explica que su trabajo se hace desde la web — nunca una rejilla vacía ni un
// error de login.

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: MeResponse };

type LoginOutcome =
  | { ok: true; user: MeResponse }
  /**
   * `organizations` llega cuando la identidad tiene varias membresías
   * (409 de `/auth/login`): la pantalla las ofrece y reintenta con `orgId`.
   */
  | { ok: false; error: string; organizations?: LoginOrganization[] };

type AuthContextValue = {
  state: AuthState;
  login: (email: string, password: string, orgId?: string) => Promise<LoginOutcome>;
  logout: () => Promise<void>;
  /** Vuelve a leer /me: lo usa el gate de compra al volver del pago. */
  refresh: () => Promise<void>;
  /**
   * Se acaba de entrar con contraseña, y la pantalla de aterrizaje todavía no
   * ha gastado la bandera. La consume `ScreenContainer` para hacer la
   * disolución del login UNA vez: sin ella, esa entrada se repetiría cada vez
   * que se vuelve a la pestaña de inicio, que es donde deja de ser una llegada
   * y pasa a ser ruido.
   */
  justSignedIn: boolean;
  consumeJustSignedIn: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [justSignedIn, setJustSignedIn] = useState(false);

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

  async function login(email: string, password: string, orgId?: string): Promise<LoginOutcome> {
    try {
      const data = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        // RB-ID-002: con varias membresías el servidor responde 409 y la app
        // reintenta con la organización que haya elegido la persona.
        body: { email, password, ...(orgId ? { orgId } : {}) },
        skipAuth: true,
      });

      await storeTokens(data);
      setJustSignedIn(true);
      setState({ status: "signedIn", user: data.user });
      return { ok: true, user: data.user };
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && Array.isArray(err.details.organizations)) {
        return {
          ok: false,
          error: err.message,
          organizations: err.details.organizations as LoginOrganization[],
        };
      }
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
    setJustSignedIn(false);
    setState({ status: "signedOut" });
  }

  const consumeJustSignedIn = useCallback(() => setJustSignedIn(false), []);

  const value = useMemo(
    () => ({ state, login, logout, refresh, justSignedIn, consumeJustSignedIn }),
    [state, justSignedIn, consumeJustSignedIn]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
