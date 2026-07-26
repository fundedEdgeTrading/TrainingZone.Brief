import { addDays, instanceForWeek, weekdayIdx } from "@/app/(app)/agenda/agenda-utils";

/**
 * Fuente única de verdad para "¿qué sesiones son mías y qué días ocurren?".
 *
 * La agenda guarda una serie recurrente como UNA fila (`date` = primera
 * ocurrencia, `recurrence`, `recUntil`) y proyecta las ocurrencias en lectura
 * con `instanceForWeek`. El panel del entrenador y el índice de briefs
 * consultaban `classSession` por rango de fechas sin esa proyección, así que
 * una serie semanal solo aparecía la semana en que se creó — y con la fecha
 * base, no la del día real. Estos helpers replican la semántica de
 * `instanceForWeek` para un rango arbitrario, para que agenda, panel y brief
 * respondan siempre lo mismo.
 */

export type RecurringSession = {
  date: Date;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil: Date | null;
};

/**
 * Sesiones del entrenador: las que tiene asignadas y las que dirigió realmente
 * (pueden diferir, ver `directedByUserId`). Es el mismo criterio que aplica
 * `canViewSessionDebrief`, de modo que todo lo que se le lista lo puede abrir.
 */
export function ownSessionsWhere(trainerUserId: string) {
  return { OR: [{ trainerId: trainerUserId }, { directedByUserId: trainerUserId }] };
}

/**
 * Filas candidatas a tener alguna ocurrencia en [from, to): las que caen
 * literalmente dentro, más las series nacidas antes y aún vigentes. Filtra en
 * BD de forma amplia; la proyección exacta la hace `occurrencesInRange`.
 */
export function sessionsInRangeWhere(from: Date, to: Date) {
  return {
    OR: [
      { date: { gte: from, lt: to } },
      {
        recurrence: { not: "NONE" as const },
        date: { lt: to },
        OR: [{ recUntil: null }, { recUntil: { gte: from } }],
      },
    ],
  };
}

/** Días reales en los que `session` ocurre dentro de [from, to), en orden. */
export function occurrencesInRange(session: RecurringSession, from: Date, to: Date): Date[] {
  const base = new Date(session.date);
  base.setHours(0, 0, 0, 0);

  if (session.recurrence === "NONE") {
    return base >= from && base < to ? [base] : [];
  }
  // Misma regla que `instanceForWeek`: una ocurrencia por semana en el día de
  // la semana de la fecha base; "WEEKDAYS" además exige que ese día sea L-V.
  if (session.recurrence === "WEEKDAYS" && weekdayIdx(base) > 4) return [];

  let occ = base;
  if (occ < from) {
    // Salto aproximado y ajuste fino: `addDays` respeta los cambios de hora,
    // restar milisegundos no.
    const weeks = Math.floor((from.getTime() - occ.getTime()) / (7 * 24 * 60 * 60 * 1000));
    occ = addDays(base, weeks * 7);
    while (occ < from) occ = addDays(occ, 7);
  }

  const out: Date[] = [];
  while (occ < to) {
    if (session.recUntil && occ > session.recUntil) break;
    out.push(occ);
    occ = addDays(occ, 7);
  }
  return out;
}

/** ¿Ocurre `session` exactamente el día `day` (medianoche local)? */
export function occursOn(session: RecurringSession, day: Date): boolean {
  return occurrencesInRange(session, day, addDays(day, 1)).length > 0;
}

/**
 * Expande cada fila en sus ocurrencias dentro de [from, to) y las ordena por
 * fecha y hora de inicio. `date` es el día real de la ocurrencia, que para una
 * serie recurrente NO coincide con `session.date`.
 */
export function expandOccurrences<T extends RecurringSession & { startTime: string }>(
  sessions: T[],
  from: Date,
  to: Date
): { session: T; date: Date }[] {
  return sessions
    .flatMap((session) => occurrencesInRange(session, from, to).map((date) => ({ session, date })))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.session.startTime.localeCompare(b.session.startTime));
}

// Reexportado para que quien proyecte una semana concreta (la rejilla de la
// agenda) siga usando exactamente la misma implementación.
export { instanceForWeek };
