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
  | { status: "signedIn"; user: MeResponse }
  /**
   * E12-08: la organización tiene el servicio suspendido (402 de `/me`,
   * `assertPlatformOperational`). Antes esto se trataba como una sesión
   * inválida más: se borraban los tokens y se mandaba a login sin explicar
   * nada, así que quien volvía a intentarlo veía "credenciales incorrectas"
   * con una contraseña que seguía siendo correcta. Los tokens se conservan
   * a propósito: en cuanto la organización se reactive, `refresh()` vuelve
   * a `signedIn` sin pedir la contraseña otra vez.
   */
  | { status: "suspended"; message: string }
  /**
   * No se ha podido hablar con el servidor al arrancar (sin red, servidor
   * caído, timeout). ANTES esto se trataba como una sesión inválida: se
   * BORRABAN los tokens y la app mandaba a login. O sea, un túnel, un ascensor
   * o un servidor lento en el momento de abrir la app te echaba de la sesión y
   * te obligaba a teclear la contraseña otra vez, con la sesión perfectamente
   * viva. Los tokens se conservan y la pantalla de arranque ofrece reintentar.
   */
  | { status: "offline"; message: string };

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

// Exportado (no solo el hook `useAuth`) para que `@/theme/theme` pueda leer el
// tema explícito del usuario con `useContext` sin lanzar cuando se llama
// fuera de `<AuthProvider>` (el `RootLayout` pinta la barra de estado antes
// de montarlo) — E13-02.
export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [justSignedIn, setJustSignedIn] = useState(false);

  /**
   * Resuelve la sesión guardada. Lo hace el arranque y lo repite `refresh()`,
   * que es lo que ofrece el botón «Reintentar» de la pantalla de espera.
   *
   * La distinción que faltaba: `status: 0` es "no he podido preguntar" (red,
   * timeout, TLS), no "la sesión no vale". Solo se borran los tokens cuando el
   * servidor RESPONDE que la identidad no sirve.
   */
  const resolveSession = useCallback(async () => {
    const { refreshToken } = await getStoredTokens();
    if (!refreshToken) {
      setState({ status: "signedOut" });
      return;
    }
    try {
      const me = await apiRequest<MeResponse>("/me");
      setState({ status: "signedIn", user: me });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        // E12-08: organización con el servicio suspendido. Los tokens se
        // conservan: en cuanto se reactive, este mismo camino vuelve a entrar.
        setState({ status: "suspended", message: err.message });
        return;
      }
      if (err instanceof ApiError && err.status === 0) {
        setState({ status: "offline", message: err.message });
        return;
      }
      await clearTokens();
      setState({ status: "signedOut" });
    }
  }, []);

  useEffect(() => {
    (async () => {
      await resolveSession();
    })();
  }, [resolveSession]);

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

  /**
   * Vuelve a leer /me. Lo usan el alta tras el pago y el «Reintentar» de las
   * pantallas de espera, así que pasa por el mismo camino que el arranque: un
   * 402 deja "suspendida", un fallo de red deja "sin conexión" —los dos con
   * los tokens intactos— y solo una respuesta del servidor que rechaza la
   * identidad cierra la sesión.
   */
  const refresh = resolveSession;

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
    [state, refresh, justSignedIn, consumeJustSignedIn]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
