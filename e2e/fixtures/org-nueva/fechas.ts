import { parseDateParam } from "@/lib/date-utils";

/**
 * Fechas del recorrido, siempre en el calendario de Madrid (la zona de los
 * centros por defecto) y no en la del proceso: el runner de CI va en UTC, y a
 * las 00:30 de Madrid "hoy" en UTC sigue siendo ayer. Con días calculados en
 * UTC, una sesión "a dos días" podía caer a uno y medio y entrar en la ventana
 * de cancelación de 24 h.
 */
const MADRID_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "YYYY-MM-DD" a `offset` días de hoy, en Madrid. */
export function madridDay(offset = 0, from = new Date()): string {
  const [y, m, d] = MADRID_DAY.format(from).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

/** Día de la semana (0 = domingo) de un "YYYY-MM-DD", sin depender de la zona del proceso. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Suma días a un "YYYY-MM-DD". */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * La fecha tal y como la guarda el servidor en `ClassSession.date` y
 * `Booking.occurrenceDate`: medianoche LOCAL del proceso (`parseDateParam`).
 * Test y servidor corren en la misma máquina, así que usar la misma función es
 * lo que garantiza que las consultas por día casen.
 */
export function dbDay(iso: string): Date {
  return parseDateParam(iso);
}
