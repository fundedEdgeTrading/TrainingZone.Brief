import type { BookingStatus } from "@prisma/client";
import { isSameDay, occurrencesInRange, type RecurringSession } from "@/lib/session-occurrences";

/**
 * E12-06: ocupación y no-show del panel, contados POR OCURRENCIA.
 *
 * `dashboard-queries.ts` filtraba por `ClassSession.date`, que en una serie
 * recurrente es solo la fecha BASE, y contaba las reservas de la fila entera
 * sin acotar por `occurrenceDate` — mientras el resto de la aplicación usa
 * `expandOccurrences`. Tres consecuencias, todas verificables:
 *
 * - Una serie creada hace seis meses no contaba nunca, aunque siga dando clase
 *   cada semana: su fecha base cae fuera de la ventana.
 * - Una serie cuya fecha base sí cae dentro aportaba su aforo UNA vez y TODAS
 *   sus reservas históricas → ocupación por encima del 100 %.
 * - La ocupación por día de la semana imputaba una serie "todos los
 *   laborables" a un solo día.
 *
 * Aquí vive la aritmética, sin Prisma: la consulta trae las filas candidatas
 * con `sessionsInRangeWhere` y esto las convierte en las ocurrencias reales de
 * la ventana, cada una con su aforo y sus reservas de ESE día.
 */

/** Estados que cuentan como plaza consumida en una sesión ya celebrada. */
export const OCCUPANCY_STATUSES = ["ATTENDED", "NO_SHOW"] as const;

export type OccupancySession = RecurringSession & {
  capacity: number;
  bookings: { status: string; occurrenceDate: Date }[];
};

export type Occurrence = {
  /** Día real de la ocurrencia, que en una serie NO es `session.date`. */
  date: Date;
  capacity: number;
  attended: number;
  noShow: number;
};

/** Ocurrencias reales de [from, to), cada una con las reservas de su propio día. */
export function occurrencesOf<T extends OccupancySession>(
  sessions: T[],
  from: Date,
  to: Date,
  each?: (session: T, occurrence: Occurrence) => void
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const session of sessions) {
    for (const date of occurrencesInRange(session, from, to)) {
      const sameDay = session.bookings.filter((b) => isSameDay(b.occurrenceDate, date));
      const occurrence: Occurrence = {
        date,
        capacity: session.capacity,
        attended: sameDay.filter((b) => b.status === "ATTENDED").length,
        noShow: sameDay.filter((b) => b.status === "NO_SHOW").length,
      };
      out.push(occurrence);
      each?.(session, occurrence);
    }
  }
  return out;
}

/** Plazas consumidas de una ocurrencia, nunca por encima de su propio aforo. */
export function consumedSpots(occurrence: Occurrence): number {
  return Math.min(occurrence.capacity, occurrence.attended + occurrence.noShow);
}

/**
 * Ocupación media ponderada: se suman plazas y consumos de todas las
 * ocurrencias antes de dividir, no se promedian porcentajes — una sesión con 4
 * plazas no puede pesar lo mismo que una de 20.
 *
 * El tope del 100 % ya no hace falta forzarlo al final (`consumedSpots` acota
 * cada ocurrencia contra su propio aforo), pero se deja explícito: es un
 * invariante de la métrica, no un efecto colateral de cómo se sume.
 */
export function occupancyPct(occurrences: Occurrence[]): number {
  const capacity = occurrences.reduce((sum, o) => sum + o.capacity, 0);
  if (!capacity) return 0;
  const consumed = occurrences.reduce((sum, o) => sum + consumedSpots(o), 0);
  return Math.min(100, Math.round((consumed / capacity) * 100));
}

/** Tasa de no presentados sobre las mismas ocurrencias que la ocupación. */
export function noShowPct(occurrences: Occurrence[]): number {
  const attended = occurrences.reduce((sum, o) => sum + o.attended, 0);
  const noShow = occurrences.reduce((sum, o) => sum + o.noShow, 0);
  return attended + noShow ? Math.round((noShow / (attended + noShow)) * 100) : 0;
}

/**
 * Ocupación por día de la semana, imputada al día REAL de cada ocurrencia: una
 * serie de lunes a viernes cuenta en los cinco días, no en uno.
 * Índice 0 = domingo, como `Date.prototype.getDay`.
 */
export function occupancyByWeekday(occurrences: Occurrence[]): number[] {
  const byWeekday = Array.from({ length: 7 }, () => ({ capacity: 0, consumed: 0 }));
  for (const occurrence of occurrences) {
    const slot = byWeekday[occurrence.date.getDay()];
    slot.capacity += occurrence.capacity;
    slot.consumed += consumedSpots(occurrence);
  }
  return byWeekday.map((v) => (v.capacity ? Math.min(100, Math.round((v.consumed / v.capacity) * 100)) : 0));
}

/**
 * Lo que hay que traer de la base de datos para poder contar por ocurrencia:
 * la recurrencia (para proyectar) y las reservas CON su `occurrenceDate` (para
 * no imputarle a un día las de todas las semanas).
 */
export const OCCUPANCY_SELECT = {
  date: true,
  recurrence: true,
  recUntil: true,
  capacity: true,
  bookings: {
    where: { status: { in: [...OCCUPANCY_STATUSES] as BookingStatus[] } },
    select: { status: true, occurrenceDate: true },
  },
};
