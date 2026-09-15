import type { BookingStatus } from "@prisma/client";
import { isSameDay, occurrencesInRange, type RecurringSession } from "@/lib/session-occurrences";
import { sessionServiceKind } from "@/lib/session-balance";

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
 *
 * ---
 *
 * E14-02: **la ocupación son dos métricas, no una.**
 *
 * Hasta el diagnóstico de E14-01 había un solo número, «Ocupación media», que
 * contaba `ATTENDED + NO_SHOW` sobre el aforo de todas las ocurrencias de la
 * ventana. Medido contra los datos de demo, eso significaba tres cosas a la vez
 * que nadie quería que significara:
 *
 * - Una ocurrencia **que todavía no se ha celebrado** aportaba su aforo entero
 *   al denominador y cero al numerador. La agenda de esta tarde hundía la cifra
 *   de esta mañana, y el día 1 de cada mes ese sesgo valía un tercio del número.
 * - Un roster **sin pasar lista** hacía lo mismo: plazas vendidas de verdad
 *   contadas como vacías.
 * - Y se promediaban dos negocios distintos: el entrenamiento personal tiene
 *   aforo 1 y llena al 44 % mientras el grupo iba al 5 %.
 *
 * Son dos preguntas y se contestan por separado:
 *
 * 1. **Plazas vendidas** (`soldPct`) — ¿estoy llenando? Cuenta lo reservado
 *    sobre el aforo, incluidas las clases que aún no se han dado, porque una
 *    plaza vendida para el viernes está vendida hoy.
 * 2. **Asistencia real** (`attendancePct`) — ¿viene quien reservó? Cuenta
 *    `ATTENDED` sobre las **plazas vendidas** de las ocurrencias **ya
 *    celebradas**, que son las únicas donde la pregunta tiene respuesta.
 *
 * `BOOKED` **no entra** en el numerador de la asistencia real. Un roster sin
 * pasar lista no es una asistencia: es un dato que falta, y por eso se cuenta
 * aparte (`unresolvedRosters`) para que la card pueda decir sobre cuánta lista
 * a medio pasar está calculada la cifra.
 */

/** Estados que ocupan una plaza de la sesión: vendida, se resuelva o no. */
export const OCCUPANCY_STATUSES = ["ATTENDED", "NO_SHOW", "BOOKED"] as const;

export type OccupancySession = RecurringSession & {
  capacity: number;
  /** Hora de fin de pared del centro ("HH:MM"): decide si la clase ya se dio. */
  endTime: string;
  /** RB-AGENDA-002: "Personal Training" es EP, el resto es grupo. */
  classType: string;
  bookings: { status: string; occurrenceDate: Date }[];
};

export type Occurrence = {
  /** Día real de la ocurrencia, que en una serie NO es `session.date`. */
  date: Date;
  /**
   * Instante en que termina la clase: el día de la ocurrencia más su `endTime`.
   * Codificado con componentes locales, igual que `ClassSession.date` y que
   * todo "día suelto + HH:MM" del proyecto (ver la nota larga de `date-utils`).
   */
  endsAt: Date;
  capacity: number;
  attended: number;
  noShow: number;
  /** Reservas que siguen en `BOOKED`: plazas vendidas y sin resolver. */
  booked: number;
  /** EP (aforo 1) o grupo. No se promedian: son dos negocios distintos. */
  kind: "EP" | "GROUP";
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
        endsAt: endOfOccurrence(date, session.endTime),
        capacity: session.capacity,
        attended: sameDay.filter((b) => b.status === "ATTENDED").length,
        noShow: sameDay.filter((b) => b.status === "NO_SHOW").length,
        booked: sameDay.filter((b) => b.status === "BOOKED").length,
        kind: sessionServiceKind(session.classType),
      };
      out.push(occurrence);
      each?.(session, occurrence);
    }
  }
  return out;
}

/** Día de la ocurrencia + "HH:MM" de fin. Una hora mal formada se trata como fin de día. */
function endOfOccurrence(date: Date, endTime: string): Date {
  const [hour, minute] = (endTime ?? "").split(":").map(Number);
  const end = new Date(date);
  if (Number.isFinite(hour) && Number.isFinite(minute)) end.setHours(hour, minute, 0, 0);
  else end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Las ocurrencias **ya celebradas** de la lista.
 *
 * El fallo que esto corrige (E14-01, cifra 2): `occurrencesInRange` normaliza
 * la fecha a medianoche y la ventana del panel termina en `now`, así que la
 * agenda ENTERA de hoy —clases de esta tarde incluidas— entraba en el
 * denominador de la asistencia aportando su aforo completo y cero asistencias.
 * Nadie puede haber asistido todavía a una clase que no se ha dado.
 */
export function heldOccurrences(occurrences: Occurrence[], now = new Date()): Occurrence[] {
  return occurrences.filter((o) => o.endsAt <= now);
}

/** Solo las de un negocio: EP y grupo no se promedian entre sí. */
export function ofKind(occurrences: Occurrence[], kind: "EP" | "GROUP"): Occurrence[] {
  return occurrences.filter((o) => o.kind === kind);
}

/** Plazas vendidas de una ocurrencia: reservadas y resueltas, nunca por encima de su aforo. */
export function soldSpots(occurrence: Occurrence): number {
  return Math.min(occurrence.capacity, occurrence.attended + occurrence.noShow + occurrence.booked);
}

/** Plazas de una ocurrencia cuya lista SÍ se pasó. Denominador de la asistencia. */
export function consumedSpots(occurrence: Occurrence): number {
  return Math.min(occurrence.capacity, occurrence.attended + occurrence.noShow);
}

const ratio = (part: number, whole: number) => (whole ? Math.min(100, Math.round((part / whole) * 100)) : 0);

/**
 * **Plazas vendidas**: qué fracción del aforo está reservada.
 *
 * Media ponderada: se suman plazas y aforos de todas las ocurrencias antes de
 * dividir, no se promedian porcentajes — una sesión con 4 plazas no puede pesar
 * lo mismo que una de 20.
 *
 * Incluye las ocurrencias futuras de la ventana a propósito: una plaza vendida
 * para el viernes está vendida hoy, y es la pregunta comercial.
 */
export function soldPct(occurrences: Occurrence[]): number {
  return ratio(
    occurrences.reduce((sum, o) => sum + soldSpots(o), 0),
    occurrences.reduce((sum, o) => sum + o.capacity, 0)
  );
}

/**
 * **Asistencia real**: de lo vendido en clases ya celebradas, cuánto se presentó.
 *
 * El denominador son las plazas vendidas y no el aforo: un grupo de 10 con 3
 * reservas en el que vienen los 3 tiene una asistencia del 100 %, porque la
 * pregunta es si viene quien reservó. Lo vacío que estaba lo cuenta `soldPct`.
 *
 * Filtra por sí misma las ocurrencias no celebradas: llamarla con la ventana
 * entera no puede hundir la cifra con la agenda de esta tarde.
 */
export function attendancePct(occurrences: Occurrence[], now = new Date()): number {
  const held = heldOccurrences(occurrences, now);
  return ratio(
    held.reduce((sum, o) => sum + o.attended, 0),
    held.reduce((sum, o) => sum + soldSpots(o), 0)
  );
}

/**
 * Cuánta lista está sin pasar en las clases ya celebradas de la ventana.
 *
 * No es una métrica de negocio: es la nota al pie obligatoria de la asistencia
 * real. Una asistencia del 90 % calculada sobre un mes con la mitad de los
 * rosters sin resolver no significa lo mismo que una calculada sobre un mes con
 * la lista al día, y la card tiene que poder decirlo.
 */
export function unresolvedRosters(
  occurrences: Occurrence[],
  now = new Date()
): { occurrences: number; bookings: number; total: number } {
  const held = heldOccurrences(occurrences, now);
  return {
    occurrences: held.filter((o) => o.booked > 0).length,
    bookings: held.reduce((sum, o) => sum + o.booked, 0),
    total: held.length,
  };
}

/** Tasa de no presentados, sobre las mismas ocurrencias ya celebradas que la asistencia. */
export function noShowPct(occurrences: Occurrence[], now = new Date()): number {
  const held = heldOccurrences(occurrences, now);
  const attended = held.reduce((sum, o) => sum + o.attended, 0);
  const noShow = held.reduce((sum, o) => sum + o.noShow, 0);
  return attended + noShow ? Math.round((noShow / (attended + noShow)) * 100) : 0;
}

/**
 * Plazas vendidas por día de la semana, imputadas al día REAL de cada
 * ocurrencia: una serie de lunes a viernes cuenta en los cinco días, no en uno.
 * Índice 0 = domingo, como `Date.prototype.getDay`.
 *
 * Mide venta y no asistencia porque la pregunta de este panel es cuál es el día
 * flojo de la semana para mover la parrilla, y para eso una plaza vendida a la
 * que luego no se vino sigue siendo demanda.
 */
export function soldByWeekday(occurrences: Occurrence[]): number[] {
  const byWeekday = Array.from({ length: 7 }, () => ({ capacity: 0, sold: 0 }));
  for (const occurrence of occurrences) {
    const slot = byWeekday[occurrence.date.getDay()];
    slot.capacity += occurrence.capacity;
    slot.sold += soldSpots(occurrence);
  }
  return byWeekday.map((v) => ratio(v.sold, v.capacity));
}

/**
 * Lo que hay que traer de la base de datos para poder contar por ocurrencia:
 * la recurrencia (para proyectar), la hora de fin y el tipo (para saber si la
 * clase ya se dio y de qué negocio es) y las reservas CON su `occurrenceDate`
 * (para no imputarle a un día las de todas las semanas).
 */
export const OCCUPANCY_SELECT = {
  date: true,
  recurrence: true,
  recUntil: true,
  capacity: true,
  endTime: true,
  classType: true,
  bookings: {
    where: { status: { in: [...OCCUPANCY_STATUSES] as BookingStatus[] } },
    select: { status: true, occurrenceDate: true },
  },
};
