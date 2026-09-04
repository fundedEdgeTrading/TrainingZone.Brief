import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { apiRequest, clearTokens, getStoredTokens, storeTokens, ApiError } from "@/api/client";
import type { LoginOrganization, LoginResponse, MeResponse, Role } from "@/api/types";

/**
 * Roles que pueden entrar en la app. Es la misma lista que `TABS_BY_ROLE`
 * (@/auth/routes): un rol con pestañas declaradas y endpoints que le responden
 * pero fuera de aquí choca en el login con «Tu rol todavía no tiene una versión
 * de la app móvil», que es lo que les pasaba a recepción y RRHH pese a que el
 * README anuncia su versión mínima y la API les sirve todas sus pantallas.
 */
const SUPPORTED_ROLES: Role[] = [
  "MEMBER",
  "TRAINER",
  "TRAINER_ADMIN",
  "OWNER",
  "CENTER_DIRECTOR",
  "PLATFORM_ADMIN",
  "RECEPTION",
  "HR_MANAGER",
];

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

  async function login(email: string, password: string, orgId?: string): Promise<LoginOutcome> {
    try {
      const data = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        // RB-ID-002: con varias membresías el servidor responde 409 y la app
        // reintenta con la organización que haya elegido la persona.
        body: { email, password, ...(orgId ? { orgId } : {}) },
        skipAuth: true,
      });

      // F1 QA: Entrenador Admin daba error de "rol no soportado" pese a tener
      // tabs propias en TABS_BY_ROLE (mismo subconjunto que Entrenador). Lo
      // mismo le pasaba a recepción (socios, agenda, avisos) y a RRHH (equipo,
      // avisos): la razón por la que quedaron fuera —"sus pantallas aún no
      // existen en la app"— dejó de ser cierta cuando entraron socios, agenda,
      // equipo y avisos, y la API les responde 200 en todas.
      if (!SUPPORTED_ROLES.includes(data.user.role)) {
        return { ok: false, error: "Tu rol todavía no tiene una versión de la app móvil." };
      }

      await storeTokens(data);
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
