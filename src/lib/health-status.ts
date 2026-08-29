import type { HealthRecordType, HealthStatus } from "@prisma/client";
import type { BadgeTone } from "@/components/ui/badge";

/**
 * Fases de un registro de salud y todo lo que se deriva de ellas en lectura
 * (rótulos, tono del distintivo, "hace 3 meses"). Vive aparte de
 * `health-access.ts` a propósito: aquello escribe y audita contra la base de
 * datos, esto son funciones puras que usan tanto la ficha del socio como el
 * Session Brief, el portal y los tests.
 *
 * Ver docs/SALUD_LESIONES_FASES.md.
 */

export const HEALTH_STATUS_LABEL: Record<HealthStatus, string> = {
  ACTIVE: "Activa",
  IN_REHAB: "En rehabilitación",
  RESOLVED: "Resuelta",
  CHRONIC: "Crónica",
};

export const HEALTH_STATUS_TONE: Record<HealthStatus, BadgeTone> = {
  ACTIVE: "warning",
  IN_REHAB: "trial",
  RESOLVED: "neutral",
  CHRONIC: "critical",
};

/** Ayuda del selector: qué significa cada fase, en el lenguaje del centro. */
export const HEALTH_STATUS_HINT: Record<HealthStatus, string> = {
  ACTIVE: "Recién sufrida o vigente, sin plan de recuperación en marcha.",
  IN_REHAB: "En rehabilitación: se entrena adaptando, no se para.",
  RESOLVED: "Recuperada. Deja de condicionar el entrenamiento.",
  CHRONIC: "Permanente: no se espera que se resuelva. Avisa en toda la ficha.",
};

/** Orden en el que se ofrecen las fases (el ciclo normal, y la crónica al final). */
export const HEALTH_STATUSES: HealthStatus[] = ["ACTIVE", "IN_REHAB", "RESOLVED", "CHRONIC"];

/**
 * Fases en las que el registro SIGUE condicionando el entrenamiento. Es el
 * filtro que sustituye al antiguo `status: "ACTIVE"` en todas las consultas
 * (semáforo de aptitud, Session Brief, panel del entrenador, portal, briefing
 * de mesociclo): antes "activa" y "vigente" eran la misma cosa porque solo
 * había dos fases; ahora una lesión en rehabilitación o crónica sigue vigente
 * aunque no esté "activa". Solo RESOLVED queda fuera.
 */
export const OPEN_HEALTH_STATUSES: HealthStatus[] = ["ACTIVE", "IN_REHAB", "CHRONIC"];

export function isOpenHealthStatus(status: HealthStatus): boolean {
  return status !== "RESOLVED";
}

/**
 * "Esto es permanente" preguntado en un único sitio. Hay dos formas de serlo y
 * las dos cuentan: la fase CHRONIC (una lesión que ya no se va a curar) y el
 * tipo CHRONIC_CONDITION (asma, diabetes...). Ver la nota de diseño del enum
 * `HealthStatus` en prisma/schema.prisma: son ejes distintos, no duplicados.
 *
 * Una condición crónica ya resuelta (se dejó atrás) no cuenta: la fase manda.
 */
export function isChronicHealthRecord(record: { type: HealthRecordType; status: HealthStatus }): boolean {
  if (record.status === "RESOLVED") return false;
  return record.status === "CHRONIC" || record.type === "CHRONIC_CONDITION";
}

/**
 * Solo la fase CHRONIC, para el aviso permanente de la cabecera de la ficha.
 * El aviso es sobre LESIONES crónicas, y `CHRONIC_CONDITION` no sirve para
 * decidirlo: la captura de salud del lead (RB-LEAD-001) escribe con ese tipo
 * todo lo que declara el interesado, incluido «ninguna». Marcar la fase es un
 * acto explícito de alguien del centro, así que es el dato en el que se puede
 * confiar para poner un aviso en toda la ficha.
 */
export function isChronicPhase(record: { status: HealthStatus }): boolean {
  return record.status === "CHRONIC";
}

// ---------- Tiempo transcurrido (derivado en lectura, nunca guardado) ----------

const DAY_MS = 86_400_000;

/** Meses cumplidos entre dos fechas, por calendario y no por división. */
export function fullMonthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "hace 3 meses" a partir de una fecha. Se calcula SIEMPRE al leer y nunca se
 * guarda: un campo `mesesDesdeLaLesion` en base de datos nace caducado.
 *
 * `approx` (el socio solo dijo mes y año) baja la resolución a meses: decir
 * "hace 12 días" de una fecha cuyo día es relleno sería precisión inventada.
 */
export function formatElapsedSince(from: Date, now: Date = new Date(), approx = false): string {
  const ms = now.getTime() - from.getTime();
  // Fecha futura (dedo torcido al teclear): no se inventa un "dentro de".
  if (ms < 0) return "hoy";

  const months = fullMonthsBetween(from, now);

  if (approx) {
    if (months < 1) return "este mes";
    if (months < 12) return `hace ${plural(months, "mes", "meses")}`;
    return formatYears(months);
  }

  const days = Math.floor(ms / DAY_MS);
  if (days === 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} días`;
  if (months < 1) return `hace ${plural(Math.floor(days / 7), "semana", "semanas")}`;
  if (months < 12) return `hace ${plural(months, "mes", "meses")}`;
  return formatYears(months);
}

function formatYears(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (rest === 0) return `hace ${plural(years, "año", "años")}`;
  return `hace ${plural(years, "año", "años")} y ${plural(rest, "mes", "meses")}`;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** La fecha tal cual se capturó: día exacto, o solo el mes si fue aproximada. */
export function formatInjuryDate(date: Date, approx = false): string {
  if (approx) return `${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

/**
 * Línea de tiempo de un registro para la ficha. Si no hay fecha de lesión
 * (todo lo anterior a esta entrega, y lo que se registre sin saberla) se dice
 * exactamente eso y se cae a la fecha de registro, que es un dato distinto y
 * se etiqueta como tal.
 */
export function injuryTimeline(record: {
  injuryDate: Date | null;
  injuryDateApprox: boolean;
  reportedAt: Date;
}, now: Date = new Date()): { label: string; elapsed: string; exact: boolean } {
  if (record.injuryDate) {
    return {
      label: `Lesión ${formatInjuryDate(record.injuryDate, record.injuryDateApprox)}`,
      elapsed: formatElapsedSince(record.injuryDate, now, record.injuryDateApprox),
      exact: !record.injuryDateApprox,
    };
  }
  return {
    label: "Fecha de lesión no registrada",
    elapsed: formatElapsedSince(record.reportedAt, now),
    exact: false,
  };
}
