/**
 * Traducción de un fallo a castellano para los estados críticos de la web
 * (E8-01).
 *
 * Los textos son **los mismos** que ya usa `apps/mobile/src/api/client.ts` en la
 * app nativa: es la forma más barata de que las dos superficies suenen igual sin
 * montar un sistema de i18n. Si allí cambia un mensaje, cambia aquí.
 */

/** Timeout de petición. Espejo de `fetchWithTimeout` en la app nativa. */
export const TIMEOUT_MESSAGE = "El servidor ha tardado demasiado en responder. Inténtalo de nuevo.";

/** Servidor inalcanzable: DNS, TLS, red caída. Espejo de la app nativa. */
export const OFFLINE_MESSAGE = "No hay conexión con el servidor. Comprueba tu red e inténtalo de nuevo.";

/**
 * Todo lo demás. En producción Next no deja pasar el mensaje real de un error de
 * Server Component al `error.tsx` (solo el `digest`), así que este es el texto
 * que verá la mayoría de las veces: tiene que sostenerse solo.
 */
export const UNEXPECTED_MESSAGE =
  "Algo ha fallado al cargar esta pantalla. No es culpa tuya y no se ha perdido nada de lo que ya estaba guardado.";

/** Marcas de fallo de red, en minúsculas: cubren navegador, Node y undici. */
const OFFLINE_MARKERS = [
  "fetch failed",
  "network request failed",
  "networkerror",
  "failed to fetch",
  "load failed",
  "econnrefused",
  "econnreset",
  "enotfound",
  "eai_again",
  "ehostunreach",
  "enetunreach",
  "socket hang up",
  "certificate",
];

// "abort" a secas y no "aborted": el nombre del error es `AbortError` en el
// navegador y `TimeoutError` en undici, y ninguno de los dos lleva la -ed.
const TIMEOUT_MARKERS = ["timeout", "timed out", "etimedout", "abort"];

/**
 * Elige el texto que se le enseña a quien está delante de la pantalla.
 *
 * Se mira `name` además del mensaje porque el abort no llega igual en todos los
 * runtimes (`AbortError`, `TimeoutError`, `TypeError: Aborted`) — el mismo
 * motivo por el que la app nativa se fía del flag del `AbortController`.
 */
export function messageForError(error?: { name?: string; message?: string } | null): string {
  if (!error) return UNEXPECTED_MESSAGE;
  const haystack = `${error.name ?? ""} ${error.message ?? ""}`.toLowerCase();
  if (TIMEOUT_MARKERS.some((marker) => haystack.includes(marker))) return TIMEOUT_MESSAGE;
  if (OFFLINE_MARKERS.some((marker) => haystack.includes(marker))) return OFFLINE_MESSAGE;
  return UNEXPECTED_MESSAGE;
}
