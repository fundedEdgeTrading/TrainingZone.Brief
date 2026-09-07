/**
 * El mesociclo situado en el calendario (E3-12 · RB-MESO-005).
 *
 * `Mesocycle` no tenía fecha de inicio, así que "semana 3" no se podía situar en
 * ningún sitio y la hoja de ruta no le decía nada a quien la leía. Y sin
 * descarga, sin progresión declarada y sin semana a semana, cada fase describía
 * "la semana tipo": una fase de 4 semanas era cuatro veces la misma semana. Eso
 * es un documento, no una periodización.
 */

/** Una fase, en lo que a calendario y descarga respecta. */
export type SchedulablePhase = {
  name: string;
  weekFrom: number;
  weekTo: number;
  deload: boolean;
  notes: string | null;
};

/** Más de esto sin decir cómo se progresa deja de ser una fase y pasa a ser un bloque plano. */
export const MAX_WEEKS_WITHOUT_PROGRESSION = 3;

export function phaseWeeks(phase: { weekFrom: number; weekTo: number }): number {
  return Math.max(0, phase.weekTo - phase.weekFrom + 1);
}

/**
 * Fecha de inicio efectiva y si es una estimación.
 *
 * Los mesociclos anteriores a esta historia no tienen `startDate`: se les asigna
 * su fecha de aprobación, MARCADA COMO ESTIMADA. Se deriva al leer en vez de
 * rellenarse con una migración porque así la marca no se pierde: una fila con
 * `startDate` escrito es una fecha que alguien declaró, y una sin él es una que
 * dedujimos. Confundirlas sería peor que no tener la fecha.
 */
export type EffectiveStart = { date: Date; estimated: boolean } | null;

export function effectiveStartDate(mesocycle: {
  startDate: Date | null;
  approvedAt: Date | null;
}): EffectiveStart {
  if (mesocycle.startDate) return { date: mesocycle.startDate, estimated: false };
  if (mesocycle.approvedAt) return { date: mesocycle.approvedAt, estimated: true };
  return null;
}

/** Semanas totales del plan: hasta dónde llega la última fase. */
export function totalWeeks(phases: { weekTo: number }[]): number {
  return phases.reduce((max, p) => Math.max(max, p.weekTo), 0);
}

export type CurrentWeek = {
  /** 1-based, como las fases. */
  week: number;
  totalWeeks: number;
  /** `true` si el plan ya terminó (la semana se acota a la última). */
  finished: boolean;
  estimatedStart: boolean;
  phaseName: string | null;
  /** La fase en curso es una descarga: el brief y el panel pueden avisar. */
  deload: boolean;
};

/**
 * En qué semana del plan está el socio HOY. `null` si el mesociclo todavía no
 * tiene fecha de inicio (ni declarada ni deducible) o si aún no ha empezado.
 */
export function currentWeekOf(
  mesocycle: { startDate: Date | null; approvedAt: Date | null },
  phases: SchedulablePhase[],
  today: Date = new Date()
): CurrentWeek | null {
  const start = effectiveStartDate(mesocycle);
  if (!start || phases.length === 0) return null;

  const startDay = atMidnight(start.date);
  const todayDay = atMidnight(today);
  const days = Math.floor((todayDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return null; // todavía no ha empezado

  const total = totalWeeks(phases);
  const raw = Math.floor(days / 7) + 1;
  const finished = raw > total;
  const week = finished ? total : raw;
  const phase = phases.find((p) => week >= p.weekFrom && week <= p.weekTo) ?? null;

  return {
    week,
    totalWeeks: total,
    finished,
    estimatedStart: start.estimated,
    phaseName: phase?.name ?? null,
    deload: phase?.deload ?? false,
  };
}

/** "Semana 3 de 8 · Acumulación" · "Semana 3 de 8 (inicio estimado)". */
export function currentWeekLabel(current: CurrentWeek | null): string {
  if (!current) return "Sin fecha de inicio";
  const parts = [`Semana ${current.week} de ${current.totalWeeks}`];
  if (current.phaseName) parts.push(current.phaseName);
  if (current.deload) parts.push("descarga");
  const label = parts.join(" · ");
  if (current.finished) return `${label} · terminado`;
  return current.estimatedStart ? `${label} (inicio estimado)` : label;
}

// ---------------------------------------------------------------------------
// Validación al aprobar
// ---------------------------------------------------------------------------

/**
 * Fases largas sin descarga ni progresión declarada. Una fase de más de tres
 * semanas que solo describe "la semana tipo" repite esa semana cuatro veces: hay
 * que decir dónde está la descarga (`deload`) o cómo progresa (las notas de la
 * fase). No se exige rellenar un campo nuevo — se exige decir algo.
 */
export function phasesWithoutProgression(phases: SchedulablePhase[]): SchedulablePhase[] {
  return phases.filter(
    (phase) =>
      phaseWeeks(phase) > MAX_WEEKS_WITHOUT_PROGRESSION &&
      !phase.deload &&
      !(phase.notes ?? "").trim()
  );
}

/** `null` si el plan se puede aprobar; si no, el motivo, listo para enseñar. */
export function approvalBlocker(
  mesocycle: { startDate: Date | null },
  phases: SchedulablePhase[]
): string | null {
  if (!mesocycle.startDate) {
    return "Indica la fecha de inicio del mesociclo antes de aprobarlo: sin ella, «semana 3» no se puede situar en el calendario.";
  }

  const offenders = phasesWithoutProgression(phases);
  if (offenders.length > 0) {
    const names = offenders.map((p) => `«${p.name}» (${phaseWeeks(p)} semanas)`).join(", ");
    return `Una fase de más de ${MAX_WEEKS_WITHOUT_PROGRESSION} semanas tiene que declarar dónde está la descarga o cómo progresa: ${names}.`;
  }

  return null;
}

function atMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
