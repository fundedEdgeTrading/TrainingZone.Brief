/**
 * Ámbito y periodo del panel de dirección.
 *
 * El panel dejó de ser "toda la organización, este mes" y pasó a tener dos
 * selectores que viajan en la URL (`?centerId=…&range=…`), así que TODA consulta
 * de `dashboard-queries.ts` acepta el mismo par de opciones. El centro se cruza
 * siempre contra el ámbito real de quien mira (`center-scope.ts`) antes de
 * llegar allí: un `?centerId=` a mano no amplía nunca lo que se ve.
 *
 * Todo lo de aquí es aritmética de fechas sin dependencias: vive fuera del
 * fichero de consultas para poder probarse sin base de datos, y para que un
 * componente de cliente pueda importar `DASHBOARD_RANGES` sin arrastrar Prisma.
 */

export type DashboardRange = "mes" | "30d" | "trim" | "ano";

export const DASHBOARD_RANGES: { id: DashboardRange; label: string; meta: string }[] = [
  { id: "mes", label: "Mes", meta: "últimos 6 meses" },
  { id: "30d", label: "30 d", meta: "últimas 4 semanas" },
  { id: "trim", label: "Trim.", meta: "trimestre en curso" },
  { id: "ano", label: "Año", meta: "últimos 10 meses" },
];

export function parseRange(value: string | undefined): DashboardRange {
  return DASHBOARD_RANGES.some((r) => r.id === value) ? (value as DashboardRange) : "mes";
}

export type DashboardOpts = {
  /** Centro activo del selector, o null/undefined para toda la organización. */
  centerId?: string | null;
  range?: DashboardRange;
};

const DAY_MS = 86_400_000;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Lunes de la semana de `d`, a medianoche local. */
function startOfWeek(d: Date) {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // getDay(): 0 = domingo. La semana ISO empieza en lunes.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

/** Número de semana ISO — el rótulo `S34` de las series semanales. */
function isoWeek(d: Date) {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  target.setUTCDate(target.getUTCDate() + 4 - (target.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

const MONTH_LABEL = (d: Date) => d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
const MONTH_NAME = (d: Date) => d.toLocaleDateString("es-ES", { month: "long" });

export type Bucket = { label: string; from: Date; to: Date };

function monthBuckets(count: number, now: Date): Bucket[] {
  const current = startOfMonth(now);
  return Array.from({ length: count }, (_, i) => {
    const from = addMonths(current, i - count + 1);
    return { label: MONTH_LABEL(from), from, to: addMonths(from, 1) };
  });
}

export function weekBuckets(count: number, now = new Date()): Bucket[] {
  const current = startOfWeek(now);
  return Array.from({ length: count }, (_, i) => {
    const from = new Date(current.getTime() + (i - count + 1) * 7 * DAY_MS);
    return { label: `S${isoWeek(from)}`, from, to: new Date(from.getTime() + 7 * DAY_MS) };
  });
}

/**
 * Los siete tramos de la sparkline de cada KPI. En «30 d» el tramo natural es
 * la semana; en el resto, el mes: siete semanas o siete meses hasta hoy.
 */
export function sparkBuckets(range: DashboardRange, now = new Date()): Bucket[] {
  return range === "30d" ? weekBuckets(7, now) : monthBuckets(7, now);
}

/** Los tramos de la serie de ingresos, que son los del rótulo de la card. */
export function revenueBuckets(range: DashboardRange, now = new Date()): Bucket[] {
  if (range === "30d") return weekBuckets(4, now);
  if (range === "trim") return monthBuckets((now.getMonth() % 3) + 1, now);
  return monthBuckets(range === "ano" ? 10 : 6, now);
}

export type ComparisonWindow = {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** "julio", "los 30 días previos"… — cómo se nombra el tramo anterior en prosa. */
  prevLabel: string;
  /** El pie del chip de delta, que sí tiene que ser explícito sobre qué compara. */
  deltaHint: string;
  /** "del mes", "de 30 días"… — completa los rótulos de los KPI de flujo. */
  scopeLabel: string;
  /** "este mes", "en 30 días"… — la misma idea en la forma que pide "Sesiones …". */
  sessionsScopeLabel: string;
};

/**
 * Ventana del periodo activo y su equivalente anterior. Es lo que compara cada
 * chip de delta: mes contra mes, trimestre en curso contra el mismo tramo del
 * anterior, año en curso contra el mismo tramo del anterior. Comparar un
 * trimestre entero contra tres días del actual daría una caída inventada, así
 * que la ventana previa se recorta siempre al mismo número de días transcurridos.
 */
export function comparisonWindow(range: DashboardRange, now = new Date()): ComparisonWindow {
  // Febrero tiene 28 días y marzo 31: sumar "lo transcurrido" al arranque del
  // tramo anterior puede meterse en el actual y contar dos veces los mismos
  // días. La ventana previa nunca pasa de donde empieza la actual.
  const clamp = (end: Date, start: Date) => new Date(Math.min(end.getTime(), start.getTime()));
  if (range === "30d") {
    const to = now;
    const from = new Date(now.getTime() - 30 * DAY_MS);
    return {
      from,
      to,
      prevFrom: new Date(now.getTime() - 60 * DAY_MS),
      prevTo: from,
      prevLabel: "los 30 días previos",
      deltaHint: "vs. los 30 días previos",
      scopeLabel: "de 30 días",
      sessionsScopeLabel: "en 30 días",
    };
  }
  if (range === "trim") {
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const elapsed = now.getTime() - quarterStart.getTime();
    const prevFrom = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
    return {
      from: quarterStart,
      to: now,
      prevFrom,
      prevTo: clamp(new Date(prevFrom.getTime() + elapsed), quarterStart),
      prevLabel: "el trimestre anterior",
      deltaHint: "vs. el trimestre anterior a esta fecha",
      scopeLabel: "del trimestre",
      sessionsScopeLabel: "este trimestre",
    };
  }
  if (range === "ano") {
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const elapsed = now.getTime() - yearStart.getTime();
    const prevFrom = new Date(now.getFullYear() - 1, 0, 1);
    return {
      from: yearStart,
      to: now,
      prevFrom,
      prevTo: clamp(new Date(prevFrom.getTime() + elapsed), yearStart),
      prevLabel: "el año anterior",
      deltaHint: "vs. el año anterior a esta fecha",
      scopeLabel: "del año",
      sessionsScopeLabel: "este año",
    };
  }
  const monthStart = startOfMonth(now);
  const prevFrom = addMonths(monthStart, -1);
  // El mes en curso va por su día 24: compararlo contra julio entero sería una
  // caída inventada. Se compara contra el mismo tramo del mes anterior, y el
  // pie lo dice ("vs. julio a esta fecha") para que nadie lea otra cosa.
  return {
    from: monthStart,
    to: now,
    prevFrom,
    prevTo: clamp(new Date(prevFrom.getTime() + (now.getTime() - monthStart.getTime())), monthStart),
    prevLabel: MONTH_NAME(prevFrom),
    deltaHint: `vs. ${MONTH_NAME(prevFrom)} a esta fecha`,
    scopeLabel: "del mes",
    sessionsScopeLabel: "este mes",
  };
}
