import { addDays } from "@/app/(app)/agenda/agenda-utils";
import { occurrencesInRange, type RecurringSession } from "@/lib/session-occurrences";

/**
 * Alcance de la edición de una sesión que se repite en el tiempo.
 *
 * Una serie recurrente es UNA fila de `ClassSession` (ver
 * `session-occurrences.ts`), así que guardar el diálogo de la agenda reescribía
 * la serie entera: marcar "Prueba" en la clase del martes que viene reetiquetaba
 * también todos los martes ya pasados, con su brief y sus reservas. Editar es
 * ahora una decisión explícita entre tres alcances, como en un calendario:
 *
 * - `all`: toda la serie, incluidas las ocurrencias anteriores.
 * - `future`: el día que se edita y los posteriores; el pasado se conserva
 *   intacto en la fila original, recortada con `recUntil`.
 * - `single`: solo ese día, que sale de la serie como sesión suelta.
 */
export type EditScope = "all" | "future" | "single";

const SCOPES: EditScope[] = ["all", "future", "single"];

export function parseEditScope(raw: unknown): EditScope {
  return SCOPES.includes(raw as EditScope) ? (raw as EditScope) : "all";
}

/** Medianoche local: la codificación de `ClassSession.date` y `recUntil`. */
export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/**
 * Días completos entre dos fechas (positivo si `to` es posterior). Se redondea
 * sobre medianoches locales para que un cambio de hora (que hace que un día
 * dure 23 o 25 horas) no descuadre el desplazamiento.
 */
export function dayDelta(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/**
 * Primera ocurrencia estrictamente posterior a `day`, o `null` si la serie no
 * continúa. Basta con mirar los 8 días siguientes: una serie semanal repite a
 * los 7 y una L–V, a los 3 como mucho (viernes → lunes).
 */
export function nextOccurrenceAfter(session: RecurringSession, day: Date): Date | null {
  const from = addDays(startOfDay(day), 1);
  return occurrencesInRange(session, from, addDays(from, 8))[0] ?? null;
}

/**
 * Alcance realmente aplicable. Pedir "esta y las siguientes" sobre la primera
 * ocurrencia, o "solo esta" sobre una serie que no continúa, es exactamente
 * editar la serie entera: dejarlo en `all` evita partirla en fragmentos que
 * describen lo mismo.
 */
export function effectiveScope(session: RecurringSession, day: Date, requested: EditScope): EditScope {
  if (session.recurrence === "NONE") return "all";
  const hasPast = startOfDay(session.date) < startOfDay(day);
  const hasFuture = nextOccurrenceAfter(session, day) !== null;
  if (requested === "future") return hasPast ? "future" : "all";
  if (requested === "single") return hasPast || hasFuture ? "single" : "all";
  return "all";
}

/**
 * `recUntil` con el que la fila original deja de cubrir `day` y posteriores,
 * conservando su propio fin si ya era anterior.
 */
export function truncatedRecUntil(session: RecurringSession, day: Date): Date {
  const cutoff = addDays(startOfDay(day), -1);
  return session.recUntil && startOfDay(session.recUntil) < cutoff ? startOfDay(session.recUntil) : cutoff;
}
