/**
 * PROD-06 · Lógica de `/api/health`, pura para poder probarla sin base de datos.
 *
 * Contrato fijo (lo usa Render como `healthCheckPath` y el comprobador de
 * disponibilidad): 200 `{ ok: true, db: "up" }` o 503 `{ ok: false, db: "down" }`.
 * Nada más: ni versión, ni región, ni el mensaje del error. Es un endpoint
 * público y sin sesión, y cualquier detalle de más es información para quien
 * esté mirando desde fuera.
 */
export const HEALTH_DB_TIMEOUT_MS = 2_000;

export type HealthBody = { ok: true; db: "up" } | { ok: false; db: "down" };
export type HealthResult = { status: 200 | 503; body: HealthBody };

/**
 * Ejecuta `ping` con un tope de tiempo. Una base de datos que no contesta es
 * una base de datos caída a efectos del balanceador: esperar a que el driver
 * se rinda dejaría el health check colgado más que el propio timeout de Render.
 */
export async function checkHealth(
  ping: () => Promise<unknown>,
  timeoutMs: number = HEALTH_DB_TIMEOUT_MS
): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
  });
  try {
    await Promise.race([ping(), timeout]);
    return { status: 200, body: { ok: true, db: "up" } };
  } catch {
    return { status: 503, body: { ok: false, db: "down" } };
  } finally {
    clearTimeout(timer);
  }
}
