import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PROD-04 · Autenticación de los disparadores de cron (`/api/jobs/run` y
 * `/api/flujos/cron`), en un solo sitio.
 *
 * - **Solo cabecera `x-cron-secret`.** Antes también valía `?secret=`: la query
 *   string acaba en los logs de acceso del proveedor, de los proxies y en el
 *   historial, así que el secreto se filtraba con el primer uso. Los dos
 *   disparadores reales (`.github/workflows/*-cron.yml`, `render.yaml`) ya
 *   mandan la cabecera.
 * - **Tiempo constante sin fuga de longitud.** `timingSafeEqual` exige buffers
 *   de igual longitud; comparar las cadenas crudas obligaba a un
 *   `if (a.length !== b.length) return false` previo que revelaba la longitud
 *   del secreto. Se comparan sus SHA-256, que siempre miden 32 bytes.
 * - **Falla cerrado.** Sin secreto configurado el endpoint no se atiende (503):
 *   un despliegue sin la variable nunca queda abierto.
 *
 * Puro (sin `next/*`): se prueba con `tsx --test`.
 */
export const CRON_SECRET_HEADER = "x-cron-secret";

export type CronAuthResult = "ok" | "unconfigured" | "unauthorized";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function checkCronSecret(provided: string | null | undefined, configured: string | null | undefined): CronAuthResult {
  if (!configured) return "unconfigured";
  if (!provided) return "unauthorized";
  return timingSafeEqual(digest(provided), digest(configured)) ? "ok" : "unauthorized";
}

/** Lee SOLO la cabecera; la query string se ignora a propósito. */
export function authorizeCronRequest(headers: Headers, configured: string | undefined = process.env.JOBS_CRON_SECRET): CronAuthResult {
  return checkCronSecret(headers.get(CRON_SECRET_HEADER), configured);
}
