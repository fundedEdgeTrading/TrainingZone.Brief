/**
 * E2-12: validación de la fecha y las horas de una sesión de agenda, en UN
 * único módulo consumido por las tres superficies de escritura
 * (`moveSessionAction`, `POST /agenda/sessions` y su `PATCH`).
 *
 * `session-actions.ts` tenía su propio `isValidHHMM` y el endpoint de huecos de
 * EP su propio `TIME_RE`, mientras el arrastrar-y-soltar y los dos endpoints de
 * sesión no validaban nada: aceptaban `startTime`/`endTime` como string libre
 * —justo el fallo que el comentario de `saveSessionAction` daba por cerrado— y
 * un "NaN:NaN" llegaba tal cual a `ClassSession`.
 *
 * Sin Prisma ni relojes: es gramática, se prueba sola.
 */

/** "HH:MM" en reloj de 24 h; nada más entra en `ClassSession.startTime`/`endTime`. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHMM(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

/** "YYYY-MM-DD", el formato que `parseDateParam` sabe leer. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Día suelto válido. No basta con la forma: "2026-02-31" la cumple y
 * `parseDateParam` la convierte en el 3 de marzo sin avisar, así que se
 * comprueba además que los componentes sobrevivan al viaje de ida y vuelta.
 */
export function isValidDateParam(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  );
}

export type ScheduleCheck = { ok: true } | { ok: false; error: string };

/**
 * Los tres controles juntos, en el orden en que se le cuentan a quien edita:
 * la fecha, cada hora por separado y la relación entre las dos. `endTime`
 * opcional porque el formulario web permite dejarlo vacío y calcular una
 * duración por defecto; lo que NO se acepta es un `endTime` escrito y
 * anterior o igual al inicio, que antes se reescribía en silencio.
 */
export function checkSessionSchedule(input: {
  date?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}): ScheduleCheck {
  if (!isValidDateParam(input.date)) return { ok: false, error: "La fecha no es válida." };
  if (!isValidHHMM(input.startTime)) return { ok: false, error: "La hora de inicio no es válida." };

  const hasEnd = input.endTime !== undefined && input.endTime !== null && input.endTime !== "";
  if (!hasEnd) return { ok: true };
  if (!isValidHHMM(input.endTime)) return { ok: false, error: "La hora de fin no es válida." };
  // Comparación de cadenas: con "HH:MM" de ancho fijo el orden lexicográfico y
  // el del reloj son el mismo, y ninguna sesión cruza la medianoche
  // (`addMinutesToTime` se topa en 23:59 a propósito).
  if ((input.endTime as string) <= (input.startTime as string)) {
    return { ok: false, error: "La hora de fin tiene que ser posterior a la de inicio." };
  }
  return { ok: true };
}
