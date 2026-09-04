export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Lee una fecha de la API respetando el día de calendario.
 *
 * `new Date("2026-09-04")` NO es medianoche local sino medianoche UTC, así que
 * en cualquier huso al oeste de Greenwich se pintaba el día anterior: una
 * renovación del día 1 salía como «31 ago». Las fechas «YYYY-MM-DD» que manda
 * la API son días de calendario sin hora, así que se leen como hora local; lo
 * que ya trae hora (`createdAt` y compañía) se parsea tal cual.
 */
function parseApiDate(iso: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
}

/** Fechas ausentes o corruptas no deben pintar «Invalid Date» en la interfaz. */
function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  const date = parseApiDate(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("es-ES", options);
}

export function formatDayLabel(iso: string): string {
  return capitalize(formatDate(iso, { weekday: "long", day: "numeric", month: "long" }));
}

export function formatShortDate(iso: string): string {
  return formatDate(iso, { day: "numeric", month: "short", year: "numeric" });
}

/** "19 sep" — para renovaciones y filas de consumo. */
export function formatDayMonth(iso: string): string {
  return formatDate(iso, { day: "numeric", month: "short" });
}

/** Importe en euros a partir de céntimos. Sin decimales cuando son cero. */
export function formatEuros(cents: number, opts: { decimals?: boolean } = {}): string {
  const showDecimals = opts.decimals ?? cents % 100 !== 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(cents / 100);
}

export function todayIso(): string {
  return isoOfDate(new Date());
}

export function isoOfDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function addDaysToIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoOfDate(date);
}

/** Mes en curso como "YYYY-MM". */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** "Septiembre 2026" para la cabecera del calendario. */
export function formatMonthTitle(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return capitalize(new Date(year, monthNumber - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" }));
}

/**
 * Rejilla del mes en semanas de lunes a domingo. Cada celda es el día
 * ("YYYY-MM-DD") o null cuando cae fuera del mes.
 */
export function monthGrid(month: string): (string | null)[][] {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const leading = (first.getDay() + 6) % 7; // lunes = 0

  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${year}-${String(monthNumber).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

export const WEEKDAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"];

/** "Martes, 19 de agosto" — cabecera de la agenda del centro. */
export function formatLongDate(iso: string): string {
  return capitalize(formatDate(iso, { weekday: "long", day: "numeric", month: "long" }));
}

/** Minutos desde medianoche de una hora "HH:mm" (timeline de la agenda). */
export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + (minutes || 0);
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
