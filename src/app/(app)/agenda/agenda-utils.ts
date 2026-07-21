// Utilidades puras de la rejilla estilo Google Calendar (fecha/geometría/solapes).
// Sin dependencias externas: usables tanto en el servidor (expandir ocurrencias
// recurrentes) como en el cliente (rejilla, arrastre, mini-calendario).

export const START_HOUR = 6;
export const END_HOUR = 22;
export const ROW_HEIGHT = 56; // px por hora

export const DAY_ABBR = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
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

export type WeekOccurrence = {
  id: string;
  dayIndex: number; // 0=lunes .. 6=domingo, dentro de la semana visible
  startMin: number;
  endMin: number;
  title: string;
  trainerId: string;
  type: SessionType;
  isTrial: boolean;
  isRecurring: boolean;
  bookedMemberId: string | null;
  status: string;
};

/**
 * Determina si `session` tiene una ocurrencia visible en la semana [ws, we)
 * y en qué día. Recurrencia "weekly"/"weekdays": la ocurrencia cae siempre en
 * el mismo día de la semana que la fecha base, mientras `occ >= base` y
 * (sin `recUntil` o `occ <= recUntil`). "weekdays" además exige que la fecha
 * base caiga de lunes a viernes.
 */
export function instanceForWeek(
  session: { date: Date; recurrence: "NONE" | "WEEKLY" | "WEEKDAYS"; recUntil: Date | null },
  ws: Date,
  we: Date
): number | null {
  const base = session.date;
  if (session.recurrence === "NONE") {
    if (base >= ws && base < we) return weekdayIdx(base);
    return null;
  }
  const wi = weekdayIdx(base);
  if (session.recurrence === "WEEKDAYS" && wi > 4) return null;
  const occ = addDays(ws, wi);
  if (occ < base) return null;
  if (session.recUntil && occ > session.recUntil) return null;
  return wi;
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
