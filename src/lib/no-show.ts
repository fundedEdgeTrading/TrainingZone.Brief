import type { NoShowReason } from "@prisma/client";

/**
 * RB-RES-009: faltas de asistencia con motivo. Marcar "No asistió" deja de ser
 * un estado a secas: el entrenador registra POR QUÉ faltó el cliente y decide
 * si la sesión vuelve al bono (`markBookingNoShow`, agenda-queries.ts).
 *
 * Aquí vive solo la parte pura: etiquetas del motivo y la cuenta de faltas
 * seguidas sin aviso. Sin Prisma a propósito, por lo mismo que session-balance.ts
 * vive aparte de members-queries.ts: el diálogo de "No asistió" es un componente
 * de cliente y necesita estas etiquetas sin arrastrar el cliente de base de
 * datos al bundle. La regla que escribe la notificación está en no-show-alerts.ts.
 */

export const NO_SHOW_REASONS = ["FORGOT", "LATE_NOTICE", "JUSTIFIED", "OUR_ERROR"] as const;

export const NO_SHOW_REASON_LABEL: Record<NoShowReason, string> = {
  FORGOT: "No avisó",
  LATE_NOTICE: "Avisó tarde",
  JUSTIFIED: "Causa justificada",
  OUR_ERROR: "Error del centro",
};

/** Texto largo para el desplegable, donde hay sitio para explicar cada motivo. */
export const NO_SHOW_REASON_HELP: Record<NoShowReason, string> = {
  FORGOT: "No avisó — no se presentó y no dijo nada",
  LATE_NOTICE: "Avisó tarde — fuera de la ventana de cancelación",
  JUSTIFIED: "Causa justificada — enfermedad o imprevisto",
  OUR_ERROR: "Error del centro — mal agendada o aviso no registrado",
};

export function parseNoShowReason(value: unknown): NoShowReason | null {
  return (NO_SHOW_REASONS as readonly string[]).includes(String(value)) ? (value as NoShowReason) : null;
}

/**
 * Faltas que cuentan como "sin aviso" para la alerta a dirección. Este array es
 * el único sitio donde se decide qué cuenta: mover un motivo de un lado a otro
 * cambia la regla entera.
 *
 * Queda solo `FORGOT`, la falta del socio. Los otros tres no son suyas:
 *
 * - `LATE_NOTICE`: avisó, aunque tarde. Dio señales.
 * - `JUSTIFIED`: tenía motivo (enfermedad, imprevisto).
 * - `OUR_ERROR`: la provocó el CENTRO —sesión mal agendada, aviso no
 *   registrado—. E12-14: sumarla a la racha abría una tarea comercial contra
 *   el cliente por algo que no hizo; dirección recibía "Fulano: 3 faltas
 *   seguidas sin avisar" cuando las tres las había provocado el centro.
 *
 * La racha se deriva del histórico en cada lectura
 * (`consecutiveNoShowsWithoutNotice`), así que sacar `OUR_ERROR` de aquí
 * recalcula también las rachas ya formadas: las faltas antiguas por error del
 * centro dejan de contar y, además, dejan de partir la racha —una falta que no
 * es del socio no debería ni sumar ni cortar—.
 */
export const NO_SHOW_REASONS_WITHOUT_NOTICE: readonly NoShowReason[] = ["FORGOT"];

/**
 * Faltas que ni suman a la racha ni la cortan, porque no dicen nada del socio:
 * la sesión no llegó a existir como compromiso suyo.
 */
export const NO_SHOW_REASONS_NOT_THE_MEMBERS: readonly NoShowReason[] = ["OUR_ERROR"];

export function isNoShowWithoutNotice(reason: NoShowReason | null | undefined): boolean {
  return reason != null && NO_SHOW_REASONS_WITHOUT_NOTICE.includes(reason);
}

/** Faltas seguidas sin aviso a partir de las que se avisa a dirección. */
export const CONSECUTIVE_NO_SHOW_THRESHOLD = 3;

export type AttendanceEntry = { status: string; noShowReason?: NoShowReason | null };

/**
 * Racha de faltas sin aviso, contada desde la sesión más reciente hacia atrás.
 *
 * Solo entran las reservas que llegaron a consumirse (ATTENDED / NO_SHOW): una
 * cancelación a tiempo no es una falta, y contarla como "hueco" partiría en dos
 * una racha que para el entrenador es la misma. Una asistencia corta la racha,
 * y una falta avisada o justificada también: son precisamente los dos casos que
 * la regla deja fuera.
 *
 * `history` viene ordenado de la más reciente a la más antigua.
 */
export function consecutiveNoShowsWithoutNotice(history: AttendanceEntry[]): number {
  let streak = 0;
  for (const entry of history) {
    if (entry.status !== "ATTENDED" && entry.status !== "NO_SHOW") continue;
    // E12-14: un error del centro no es un hueco del socio. Ni suma ni corta:
    // se salta, igual que una cancelación a tiempo.
    if (
      entry.status === "NO_SHOW" &&
      entry.noShowReason != null &&
      NO_SHOW_REASONS_NOT_THE_MEMBERS.includes(entry.noShowReason)
    ) {
      continue;
    }
    if (entry.status === "NO_SHOW" && isNoShowWithoutNotice(entry.noShowReason)) {
      streak++;
      continue;
    }
    break;
  }
  return streak;
}

export function reachesConsecutiveNoShowAlert(history: AttendanceEntry[]): boolean {
  return consecutiveNoShowsWithoutNotice(history) >= CONSECUTIVE_NO_SHOW_THRESHOLD;
}
