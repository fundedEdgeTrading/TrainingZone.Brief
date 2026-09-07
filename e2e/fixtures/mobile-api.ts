import type { APIRequestContext } from "@playwright/test";

/**
 * Cliente de la API móvil para los specs de E7-06.
 *
 * La API móvil no usa cookie de sesión: cada petición lleva
 * `Authorization: Bearer <access token>` firmado por `signAccessToken`, con
 * `orgId`/`centerId` DENTRO del token. Por eso estos specs no necesitan
 * navegador —`request.newContext()` basta— y por eso son los primeros que se
 * escriben: prueban exactamente la superficie donde se colaron nueve de los
 * hallazgos del informe, sin depender de que exista pantalla.
 */

export const API_PREFIX = "/api/mobile/v1";
export const DEMO_PASSWORD = "demo1234";

export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    orgId: string;
    centerId: string | null;
  };
};

/** Envoltura uniforme de la API (`_lib/response.ts`). */
export type ApiEnvelope<T> = { ok: true; data: T } | ({ ok: false; error: string } & Record<string, unknown>);

/**
 * Login por la misma puerta que la app: si esto cambia, los specs se enteran
 * aquí y no con ocho fallos repartidos.
 */
export async function mobileLogin(
  request: APIRequestContext,
  email: string,
  password = DEMO_PASSWORD
): Promise<MobileSession> {
  const res = await request.post(`${API_PREFIX}/auth/login`, { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`Login móvil de ${email} devolvió ${res.status()}: ${await res.text()}`);
  }
  const body = (await res.json()) as ApiEnvelope<MobileSession>;
  if (!body.ok) throw new Error(`Login móvil de ${email} respondió ok:false — ${body.error}`);
  return body.data;
}

export function bearer(session: MobileSession) {
  return { Authorization: `Bearer ${session.accessToken}` };
}

/** Cuerpo tipado sin repetir el `as` en cada aserción. */
export async function jsonOf<T>(res: { json: () => Promise<unknown> }): Promise<ApiEnvelope<T>> {
  return (await res.json()) as ApiEnvelope<T>;
}
