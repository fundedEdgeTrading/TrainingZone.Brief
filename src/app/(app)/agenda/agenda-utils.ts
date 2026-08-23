// Utilidades puras de la rejilla estilo Google Calendar (fecha/geometría/solapes).
// Sin dependencias externas: usables tanto en el servidor (expandir ocurrencias
// recurrentes) como en el cliente (rejilla, arrastre, mini-calendario).

export const START_HOUR = 6;
export const END_HOUR = 22;
export const ROW_HEIGHT = 56; // px por hora
// En móvil solo se pinta un día, así que la hora puede ocupar más alto: las
// tarjetas crecen y se pueden tocar/arrastrar con el dedo sin apuntar.
export const ROW_HEIGHT_MOBILE = 72;

// De momento la agenda solo pinta de lunes a sábado (el domingo no se opera).
export const VISIBLE_DAYS = 6;

export const DAY_ABBR = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
export const DAY_LETTER = ["L", "M", "X", "J", "V", "S", "D"];
export const DAY_NAME = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Paleta de tonos tierra para entrenadores sin color asignado explícito.
export const TRAINER_PALETTE = ["#5f6d34", "#6d4a5a", "#8a6a2e", "#98523a", "#45635f"];

export function trainerColor(trainerId: string) {
  let hash = 0;
  for (let i = 0; i < trainerId.length; i++) hash = (hash * 31 + trainerId.charCodeAt(i)) >>> 0;
  return TRAINER_PALETTE[hash % TRAINER_PALETTE.length];
}

export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Índice de día de la semana con lunes=0 ... domingo=6. */
export function weekdayIdx(d: Date) {
  return (d.getDay() + 6) % 7;
}

/**
 * ¿Opera el centro ese día? Hoy: de lunes a sábado.
 *
 * La regla vivía solo como un descarte de PINTADO en la rejilla de la agenda
 * (`VISIBLE_DAYS`), y esa asimetría dejaba que el socio reservara por el portal
 * una sesión en domingo que su entrenador no podía ni abrir ni editar. Al
 * exponerla como predicado, rejilla y motor de reservas (portal-queries.ts)
 * citan la MISMA fuente en vez de duplicar un `=== 0` mágico.
 */
export function isOperatingDay(d: Date): boolean {
  return weekdayIdx(d) < VISIBLE_DAYS;
}

export function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function fmtHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snap(v: number, step: number) {
  return Math.round(v / step) * step;
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export type SessionType = "personal" | "reduced";

/** Plazas por defecto de un grupo reducido nuevo (el EP es siempre 1 a 1). */
export const DEFAULT_GROUP_CAPACITY = 6;
export const MAX_GROUP_CAPACITY = 30;

/** Umbral de aviso: plazas libres a partir de las cuales se marca en ámbar. */
export const CAPACITY_WARN_AT = 1;

/**
 * Ámbar y rojo de aforo sobre el color del entrenador (variantes claras de
 * `--color-warning` y `--color-critical`). La tarjeta siempre lleva de fondo el
 * color del entrenador, y estas son las únicas variantes legibles sobre él.
 */
export const CAPACITY_AMBER = "#f0b357";
export const CAPACITY_FULL = "#e08a6f";

export type Occupancy = {
  /** 0–100. En EP la capacidad es siempre 1, así que da 0 o 100. */
  pct: number;
  free: number;
  full: boolean;
  /** Queda CAPACITY_WARN_AT o menos, pero no está llena. */
  lastSeats: boolean;
};

/**
 * Regla única de aforo: rejilla y diálogo citan esta misma fuente en vez de
 * recalcular cada uno su porcentaje.
 */
export function occupancyOf(o: { capacity: number; bookedCount: number }): Occupancy {
  const capacity = Math.max(1, o.capacity);
  const free = capacity - o.bookedCount;
  const full = free <= 0;
  return {
    pct: Math.max(0, Math.min(100, (o.bookedCount / capacity) * 100)),
    free,
    full,
    lastSeats: !full && free <= CAPACITY_WARN_AT,
  };
}

/** Nombre corto para la tarjeta: "Marta García López" → "Marta G." */
export function shortMemberName(name: string) {
  const p = name.trim().split(/\s+/);
  return p[1] ? `${p[0]} ${p[1][0]}.` : p[0];
}

export type WeekOccurrence = {
  id: string;
  /**
   * Identidad de LA OCURRENCIA (`id:dayIndex`). Una serie L–V rinde varias
   * ocurrencias en la misma semana compartiendo `id`, así que la rejilla no
   * puede usarlo ni como clave de React ni para saber cuál se está arrastrando:
   * con `id` a secas, mover el lunes movía también el resto de la semana.
   */
  uid: string;
  dayIndex: number; // 0=lunes .. 6=domingo, dentro de la semana visible
  startMin: number;
  endMin: number;
  title: string;
  trainerId: string;
  type: SessionType;
  capacity: number;
  selfBookable: boolean;
  isTrial: boolean;
  isRecurring: boolean;
  // La recurrencia real de la serie, no solo "si la tiene": el diálogo de
  // edición la reenvía tal cual al guardar, y con un booleano una serie L–V o
  // con fecha de fin se degradaba a semanal indefinida en cuanto el entrenador
  // tocaba cualquier otro campo.
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntilISO: string | null;
  bookedMemberId: string | null;
  /** Nombre completo del socio de la reserva activa (solo EP). */
  bookedMemberName: string | null;
  bookedCount: number;
  status: string;
};

/**
 * Días de la semana [ws, we) en los que `session` tiene ocurrencia.
 *
 * - "NONE": su propio día, si cae dentro de la semana.
 * - "WEEKLY": el mismo día de la semana que la fecha base.
 * - "WEEKDAYS": TODOS los días laborables (L–V), que es lo que ofrece el
 *   diálogo ("Todos los días laborables"). Antes compartía implementación con
 *   "WEEKLY" y solo se comprobaba que la fecha base no cayera en fin de semana,
 *   así que una serie L–V rendía una única sesión por semana.
 *
 * En los tres casos la ocurrencia debe caer en la serie: no antes de la fecha
 * base y, si hay `recUntil`, no después.
 */
export function instancesForWeek(
  session: { date: Date; recurrence: "NONE" | "WEEKLY" | "WEEKDAYS"; recUntil: Date | null },
  ws: Date,
  we: Date
): number[] {
  const base = session.date;
  if (session.recurrence === "NONE") {
    return base >= ws && base < we ? [weekdayIdx(base)] : [];
  }

  const inSeries = (occ: Date) => occ >= base && (!session.recUntil || occ <= session.recUntil);

  if (session.recurrence === "WEEKDAYS") {
    const out: number[] = [];
    for (let i = 0; i <= 4; i++) if (inSeries(addDays(ws, i))) out.push(i);
    return out;
  }

  const wi = weekdayIdx(base);
  return inSeries(addDays(ws, wi)) ? [wi] : [];
}

type LayoutEvent = { id: string; startMin: number; endMin: number };

/** Reparte eventos solapados de un mismo día en columnas (algoritmo de barrido). */
export function layoutDay<T extends LayoutEvent>(evs: T[]): (T & { col: number; total: number })[] {
  const sorted = [...evs].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: (T & { col: number; total: number })[] = [];
  let group: T[] = [];
  let groupEnd = -1;

  const flush = () => {
    const colsEnd: number[] = [];
    const placed = group.map((ev) => {
      let c = colsEnd.findIndex((end) => end <= ev.startMin);
      if (c === -1) {
        c = colsEnd.length;
        colsEnd.push(0);
      }
      colsEnd[c] = ev.endMin;
      return { ev, col: c };
    });
    placed.forEach(({ ev, col }) => out.push({ ...ev, col, total: colsEnd.length }));
    group = [];
    groupEnd = -1;
  };

  for (const ev of sorted) {
    if (group.length && ev.startMin >= groupEnd) flush();
    group.push(ev);
    groupEnd = Math.max(groupEnd, ev.endMin);
  }
  if (group.length) flush();
  return out;
}
