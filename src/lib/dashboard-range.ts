import type { MemberState } from "@prisma/client";
import { addMonthsClamped, formatDateParam, parseDateParam } from "@/lib/date-utils";

/**
 * Ámbito y periodo del panel de dirección.
 *
 * El panel dejó de ser "toda la organización, este mes" y pasó a tener dos
 * selectores que viajan en la URL (`?centerId=…&range=…`), así que TODA consulta
 * de `dashboard-queries.ts` acepta el mismo par de opciones. El centro se cruza
 * siempre contra el ámbito real de quien mira (`center-scope.ts`) antes de
 * llegar allí: un `?centerId=` a mano no amplía nunca lo que se ve.
 *
 * Todo lo de aquí es aritmética de fechas sin dependencias de servidor: vive
 * fuera del fichero de consultas para poder probarse sin base de datos, y para
 * que un componente de cliente pueda importar `DASHBOARD_RANGES` sin arrastrar
 * Prisma.
 */

/**
 * E14-06 · siete periodos y uno personalizado.
 *
 * Los cuatro de antes eran `mes`/`30d`/`trim`/`ano`. Los nuevos se eligieron
 * para cubrir las tres formas en que dirección mira el negocio —el día que está
 * pasando, el tramo de calendario en curso, y la tendencia larga— y no para
 * tener más botones:
 *
 * - **Anclados al calendario** (`dia`, `semana`, `mes`, `ano`): van del arranque
 *   del periodo a ahora. Contestan "¿cómo llevo el mes?".
 * - **Móviles** (`3m`, `6m`): son los últimos N meses hasta hoy. Contestan
 *   "¿cómo va la tendencia?", que no es lo mismo y no depende de qué día sea.
 * - **Personalizado** (`custom`): lo que pida quien mira, validado.
 *
 * `30d` y `trim` desaparecen: el primero es `mes` para casi cualquier lectura y
 * el segundo se solapaba con `3m` diciendo algo distinto (trimestre natural en
 * curso, que el día 1 de abril son cero días). Los enlaces viejos siguen
 * funcionando por `RANGE_ALIASES`.
 */
export type DashboardRange = "dia" | "semana" | "mes" | "3m" | "6m" | "ano" | "custom";

export const DASHBOARD_RANGES: { id: DashboardRange; label: string; meta: string }[] = [
  { id: "dia", label: "Hoy", meta: "hoy, hora a hora" },
  { id: "semana", label: "Semana", meta: "esta semana, día a día" },
  { id: "mes", label: "Mes", meta: "últimos 6 meses" },
  { id: "3m", label: "3 meses", meta: "los 3 meses del periodo" },
  { id: "6m", label: "6 meses", meta: "los 6 meses del periodo" },
  { id: "ano", label: "Año", meta: "últimos 10 meses" },
  { id: "custom", label: "Personalizado", meta: "el periodo elegido" },
];

/**
 * Un enlace guardado o compartido con el selector viejo no puede caer en el
 * periodo por defecto sin decir nada: quien lo abrió esperaba un trimestre.
 * `trim` es lo más parecido a `3m`; `30d`, a `mes`.
 */
const RANGE_ALIASES: Record<string, DashboardRange> = { trim: "3m", "30d": "mes" };

export function parseRange(value: string | undefined): DashboardRange {
  if (DASHBOARD_RANGES.some((r) => r.id === value)) return value as DashboardRange;
  return (value && RANGE_ALIASES[value]) || "mes";
}

/** Periodo elegido a mano, ya validado. `to` nunca está en el futuro. */
export type CustomRange = { from: Date; to: Date };

/**
 * E11-01 · Los estados que cuentan como "socio vivo" en una agregación.
 *
 * Fuera `CANCELLED` y `PROSPECT`: un cancelado ya no es socio y un prospecto
 * todavía no lo es. Contarlos hace que un barrio del que se está yendo la gente
 * se siga pintando oscuro, que es justo al revés de lo que hay que ver.
 *
 * ⚠️ Tiene que decir lo mismo que `memberStatesFor("activos")`
 * (`barrio-map-params.ts`, de la pista T7/M2), que es quien traduce
 * `?estado=activos` de la URL. Son dos capas distintas —una lee la URL y la
 * otra pone el criterio por defecto de la agregación— y por eso no se puede
 * borrar ninguna, pero si se separan vuelve el fallo del "espejo" que AGENTS.md
 * prohíbe. Hay una prueba que las cruza.
 */
export const LIVE_MEMBER_STATES: MemberState[] = ["TRIAL", "ACTIVE", "DELINQUENT", "FROZEN"];

export type DashboardOpts = {
  /** Centro activo del selector, o null/undefined para toda la organización. */
  centerId?: string | null;
  /**
   * Ámbito de centro (center-scope.ts) de quien pregunta, cuando la consulta
   * necesita filtrar por MÁS de un centro a la vez (p. ej. mapa de barrios con
   * un director imputado a varios centros). `undefined` = sin restricción.
   * Distinto de `centerId`, que es la elección puntual de un único centro en
   * el selector de la pantalla.
   */
  centerIds?: string[];
  range?: DashboardRange;
  /**
   * Las dos fechas de `range === "custom"`. Viajan por separado y no dentro de
   * `range` para que el tipo del selector siga siendo una cadena corta que cabe
   * en la URL y en un `switch`. Con `range === "custom"` y esto vacío se cae al
   * mes en curso: un periodo que no se pudo validar no puede tumbar la pantalla.
   */
  custom?: CustomRange;
  /**
   * E11-01 · Estados de socio que entran en la agregación.
   *
   * El mapa de barrios contaba TODOS los estados, cancelados y prospectos
   * incluidos, así que un barrio del que se estaba yendo la gente seguía
   * pintándose oscuro — al revés de lo que dirección necesita ver. El criterio
   * por defecto es "socios vivos" (`LIVE_MEMBER_STATES`), y este parámetro
   * permite pedir lo contrario, que es lo que necesita la métrica de fuga
   * (E11-09).
   */
  memberStates?: MemberState[];
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Lunes de la semana de `d`, a medianoche local. */
function startOfWeek(d: Date) {
  const start = startOfDay(d);
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
const WEEKDAY_LABEL = (d: Date) => d.toLocaleDateString("es-ES", { weekday: "short" }).replace(".", "");
const DAY_LABEL = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;

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
 * Los `count` últimos días hasta hoy incluido.
 *
 * Dos rótulos porque son dos lecturas: dentro de una semana lo que se busca es
 * el día de la semana ("los martes no viene nadie"), y en un tramo más largo el
 * día de la semana se repite y hace falta la fecha.
 */
export function dayBuckets(count: number, now = new Date(), style: "weekday" | "date" = "date"): Bucket[] {
  const current = startOfDay(now);
  return Array.from({ length: count }, (_, i) => {
    // Aritmética de calendario y no de milisegundos: en el cambio de hora un
    // día no dura 24 h y los tramos se desalinearían.
    const from = new Date(current.getFullYear(), current.getMonth(), current.getDate() + (i - count + 1));
    const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
    return { label: style === "weekday" ? WEEKDAY_LABEL(from) : DAY_LABEL(from), from, to };
  });
}

/** Las `count` últimas horas hasta la que está corriendo, incluida. */
export function hourBuckets(count: number, now = new Date()): Bucket[] {
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  return Array.from({ length: count }, (_, i) => {
    const from = new Date(current.getTime() + (i - count + 1) * HOUR_MS);
    return { label: `${String(from.getHours()).padStart(2, "0")}h`, from, to: new Date(from.getTime() + HOUR_MS) };
  });
}

type BucketUnit = "hour" | "day" | "week" | "month";

/**
 * Cuántos tramos caben en una gráfica de ingresos sin que las barras dejen de
 * leerse. Es también lo que fija la escalera de `customUnit`.
 */
const MAX_BUCKETS = 31;

/**
 * Tramo natural de un periodo personalizado.
 *
 * No se parte la ventana en siete trozos iguales a propósito: un tramo de 4,3
 * días no tiene rótulo que no mienta. Se elige la unidad de calendario cuya
 * cuenta cabe entera —horas, días, semanas ISO o meses de verdad— y por eso
 * cada escalón está en `MAX_BUCKETS` de la unidad anterior. Con el tope de dos
 * años (`CUSTOM_RANGE_MAX_DAYS`) el último escalón son 24 meses, así que
 * ninguna ventana válida se queda sin unidad y ninguna hay que recortarla:
 * recortar sería dejar fuera el principio del periodo sin decirlo.
 */
function customUnit(custom: CustomRange): BucketUnit {
  const hours = (custom.to.getTime() - custom.from.getTime()) / HOUR_MS;
  if (hours <= MAX_BUCKETS) return "hour";
  const days = hours / 24;
  if (days <= MAX_BUCKETS) return "day";
  return days / 7 <= MAX_BUCKETS ? "week" : "month";
}

/** Duración aproximada de cada unidad, solo para contar cuántos tramos pedir. */
const UNIT_MS: Record<BucketUnit, number> = {
  hour: HOUR_MS,
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
};

/**
 * `count` tramos de `unit` terminando en el que contiene el último instante de
 * la ventana. Se ancla en `to - 1 ms` y no en `to` porque `to` es EXCLUSIVO: un
 * periodo "hasta el 31 de agosto" termina el 1 de septiembre a las 00:00, y
 * anclar ahí metería un tramo de septiembre que no está en la ventana.
 */
function bucketsOfUnit(unit: BucketUnit, count: number, to: Date): Bucket[] {
  const end = new Date(to.getTime() - 1);
  if (unit === "hour") return hourBuckets(count, end);
  if (unit === "day") return dayBuckets(count, end);
  if (unit === "week") return weekBuckets(count, end);
  return monthBuckets(count, end);
}

/**
 * Los tramos que cubren el periodo personalizado entero, de principio a fin.
 *
 * La cuenta no se puede sacar dividiendo y ya: los tramos están anclados al
 * calendario y la ventana no. Un periodo del 1 de mayo (viernes) al 30 de junio
 * son 8,7 semanas, pero las semanas ISO empiezan en lunes, así que nueve
 * tramos arrancan el 4 de mayo y se dejan fuera los tres primeros días. Se
 * añaden tramos hasta que el primero cubre el arranque: un tramo de más enseña
 * días que quedan fuera del periodo —y su rótulo lo dice—, mientras que uno de
 * menos oculta días que sí están dentro.
 */
function coveringBuckets(unit: BucketUnit, custom: CustomRange): Bucket[] {
  const span = custom.to.getTime() - custom.from.getTime();
  let count = Math.max(1, Math.ceil(span / UNIT_MS[unit]));
  let buckets = bucketsOfUnit(unit, count, custom.to);
  // `customUnit` garantiza que la cuenta cabe en `MAX_BUCKETS`; el desfase de
  // calendario no puede pedir más de un tramo extra, y el tope lo asegura.
  while (buckets[0].from > custom.from && count < MAX_BUCKETS + 1) {
    buckets = bucketsOfUnit(unit, ++count, custom.to);
  }
  return buckets;
}

/**
 * Los siete tramos de la sparkline de cada KPI: el contexto reciente de la
 * métrica, siempre siete puntos y siempre terminando en el tramo en curso. La
 * unidad es la natural del periodo — la hora en «Hoy», el día en «Semana», el
 * mes en el resto — para que el dibujo no comprima seis meses en el mismo
 * ancho en que enseña seis horas.
 */
export function sparkBuckets(range: DashboardRange, now = new Date(), custom?: CustomRange): Bucket[] {
  if (range === "dia") return hourBuckets(7, now);
  if (range === "semana") return dayBuckets(7, now, "weekday");
  if (range === "custom" && custom) return bucketsOfUnit(customUnit(custom), 7, custom.to);
  return monthBuckets(7, now);
}

/**
 * Los tramos de la serie de ingresos, que son los de la gráfica y los que
 * anuncia el `meta` de la card.
 *
 * En los periodos móviles y en los cortos la serie ES el periodo: las horas
 * transcurridas de hoy, los días transcurridos de la semana, los tres o los
 * seis meses. En `mes` y `ano` la serie sigue siendo contexto más largo que la
 * ventana (seis y diez meses) porque así estaba y así lo dice su rótulo — un
 * cambio de forma en el periodo por defecto sin que nadie lo haya pedido es
 * justo lo que el diagnóstico de E14-01 desaconseja.
 */
export function revenueBuckets(range: DashboardRange, now = new Date(), custom?: CustomRange): Bucket[] {
  if (range === "dia") return hourBuckets(now.getHours() + 1, now);
  if (range === "semana") return dayBuckets(((now.getDay() + 6) % 7) + 1, now, "weekday");
  if (range === "3m") return monthBuckets(3, now);
  if (range === "6m") return monthBuckets(6, now);
  if (range === "custom" && custom) return coveringBuckets(customUnit(custom), custom);
  return monthBuckets(range === "ano" ? 10 : 6, now);
}

/** El pie de la card de ingresos: qué tramos está enseñando de verdad. */
export function rangeMeta(range: DashboardRange, custom?: CustomRange): string {
  if (range === "custom") {
    if (!custom) return DASHBOARD_RANGES.find((r) => r.id === "mes")?.meta ?? "";
    const day = (d: Date) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "");
    // `to` es exclusivo: el último día del periodo es el anterior.
    return `del ${day(custom.from)} al ${day(new Date(custom.to.getTime() - 1))}`;
  }
  return DASHBOARD_RANGES.find((r) => r.id === range)?.meta ?? "";
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

const clampTo = (end: Date, start: Date) => new Date(Math.min(end.getTime(), start.getTime()));

/**
 * Ventana anclada al calendario: del arranque del periodo a ahora, contra el
 * mismo tramo transcurrido del periodo anterior.
 *
 * Febrero tiene 28 días y marzo 31: sumar "lo transcurrido" al arranque del
 * tramo anterior puede meterse en el actual y contar dos veces los mismos días.
 * La ventana previa nunca pasa de donde empieza la actual.
 */
function anchoredWindow(from: Date, prevFrom: Date, now: Date) {
  return { from, to: now, prevFrom, prevTo: clampTo(new Date(prevFrom.getTime() + (now.getTime() - from.getTime())), from) };
}

/**
 * Ventana móvil: los últimos N hasta ahora, contra los N justo anteriores.
 *
 * Aquí el recorte de `anchoredWindow` no hace falta y no porque sea otra regla,
 * sino porque es la misma aplicada a una ventana que ya está entera
 * transcurrida: "los mismos días transcurridos" son todos, y `prevTo` cae
 * exactamente donde empieza la actual. Sin solape y sin hueco.
 */
function rollingWindow(from: Date, prevFrom: Date, now: Date) {
  return { from, to: now, prevFrom, prevTo: from };
}

/**
 * Ventana del periodo activo y su equivalente anterior. Es lo que compara cada
 * chip de delta: mes contra mes, tres meses contra los tres previos, año en
 * curso contra el mismo tramo del anterior. Comparar un trimestre entero contra
 * tres días del actual daría una caída inventada, así que la ventana previa se
 * recorta siempre al mismo número de días transcurridos.
 *
 * E14-06: la regla NO se reescribió al pasar de cuatro periodos a siete — se
 * extendió. Los siete la cumplen, incluido el personalizado, cuyo tramo previo
 * es el mismo número de días justo antes.
 */
export function comparisonWindow(range: DashboardRange, now = new Date(), custom?: CustomRange): ComparisonWindow {
  if (range === "dia") {
    const from = startOfDay(now);
    const prevFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1);
    return {
      ...anchoredWindow(from, prevFrom, now),
      prevLabel: "ayer",
      deltaHint: "vs. ayer a esta hora",
      scopeLabel: "de hoy",
      sessionsScopeLabel: "hoy",
    };
  }
  if (range === "semana") {
    const from = startOfWeek(now);
    const prevFrom = new Date(from.getFullYear(), from.getMonth(), from.getDate() - 7);
    return {
      ...anchoredWindow(from, prevFrom, now),
      prevLabel: "la semana pasada",
      deltaHint: "vs. la semana pasada a este día",
      scopeLabel: "de la semana",
      sessionsScopeLabel: "esta semana",
    };
  }
  if (range === "3m" || range === "6m") {
    const months = range === "3m" ? 3 : 6;
    return {
      ...rollingWindow(addMonthsClamped(now, -months), addMonthsClamped(now, -2 * months), now),
      prevLabel: `los ${months} meses previos`,
      deltaHint: `vs. los ${months} meses previos`,
      scopeLabel: `de ${months} meses`,
      sessionsScopeLabel: `en ${months} meses`,
    };
  }
  if (range === "ano") {
    const from = new Date(now.getFullYear(), 0, 1);
    return {
      ...anchoredWindow(from, new Date(now.getFullYear() - 1, 0, 1), now),
      prevLabel: "el año anterior",
      deltaHint: "vs. el año anterior a esta fecha",
      scopeLabel: "del año",
      sessionsScopeLabel: "este año",
    };
  }
  if (range === "custom" && custom) {
    const span = custom.to.getTime() - custom.from.getTime();
    const days = Math.max(1, Math.round(span / DAY_MS));
    return {
      from: custom.from,
      to: custom.to,
      prevFrom: new Date(custom.from.getTime() - span),
      prevTo: custom.from,
      prevLabel: `los ${days} días previos`,
      deltaHint: `vs. los ${days} días justo anteriores`,
      scopeLabel: "del periodo",
      sessionsScopeLabel: "en el periodo",
    };
  }
  // `mes`, y también `custom` sin fechas válidas: un periodo que no se pudo
  // validar cae en el de por defecto en vez de romper la pantalla.
  const monthStart = startOfMonth(now);
  const prevFrom = addMonths(monthStart, -1);
  // El mes en curso va por su día 24: compararlo contra julio entero sería una
  // caída inventada. Se compara contra el mismo tramo del mes anterior, y el
  // pie lo dice ("vs. julio a esta fecha") para que nadie lea otra cosa.
  return {
    ...anchoredWindow(monthStart, prevFrom, now),
    prevLabel: MONTH_NAME(prevFrom),
    deltaHint: `vs. ${MONTH_NAME(prevFrom)} a esta fecha`,
    scopeLabel: "del mes",
    sessionsScopeLabel: "este mes",
  };
}

// ---------- Periodo personalizado: validación ----------

/**
 * Amplitud máxima del periodo personalizado.
 *
 * Dos años no es un número redondo elegido por serlo: por encima de eso el
 * panel deja de ser un panel. `getKpiTiles` trae a memoria los cobros y las
 * sesiones de la ventana MÁS la ventana previa para poder comparar, así que
 * pedir cinco años son diez de datos crudos en el proceso — y una gráfica de
 * ingresos con sesenta barras no se lee. Quien necesite más que esto necesita
 * una exportación, no un selector.
 */
export const CUSTOM_RANGE_MAX_DAYS = 730;

export type CustomRangeError = "incompleto" | "formato" | "invertido" | "futuro" | "amplitud";

export const CUSTOM_RANGE_MESSAGE: Record<CustomRangeError, string> = {
  incompleto: "Indica las dos fechas del periodo.",
  formato: "Las fechas del periodo no son válidas.",
  invertido: "La fecha de inicio es posterior a la de fin.",
  futuro: "El periodo no puede terminar en el futuro: todavía no hay datos.",
  amplitud: `El periodo no puede pasar de ${CUSTOM_RANGE_MAX_DAYS} días (dos años).`,
};

export type CustomRangeResult =
  | { ok: true; range: CustomRange }
  | { ok: false; error: CustomRangeError; message: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const date = parseDateParam(value);
  // `parseDateParam` normaliza el desbordamiento (2026-02-31 → 3 de marzo), así
  // que se comprueba la ida y vuelta: un día que no existe no es un día.
  return Number.isNaN(date.getTime()) || formatDateParam(date) !== value ? null : date;
}

/**
 * Valida `?desde=…&hasta=…` y devuelve la ventana, o el motivo del rechazo.
 *
 * Rechaza **sin romper la pantalla**: quien llama se queda con el periodo por
 * defecto y enseña `message`. Es un parámetro de URL, o sea que llega escrito a
 * mano, pegado de un chat o recortado por un cliente de correo tan a menudo
 * como del propio selector.
 *
 * `to` es exclusivo y nunca está en el futuro: pedir "hasta hoy" termina en
 * este instante, no a medianoche, para que la ventana signifique lo mismo que
 * la de los demás periodos.
 */
export function parseCustomRange(
  desde: string | undefined,
  hasta: string | undefined,
  now = new Date()
): CustomRangeResult {
  const fail = (error: CustomRangeError): CustomRangeResult => ({
    ok: false,
    error,
    message: CUSTOM_RANGE_MESSAGE[error],
  });

  if (!desde || !hasta) return fail("incompleto");
  const from = parseDay(desde);
  const lastDay = parseDay(hasta);
  if (!from || !lastDay) return fail("formato");
  if (from > lastDay) return fail("invertido");
  if (lastDay > startOfDay(now)) return fail("futuro");

  const to = clampTo(new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1), now);
  if ((to.getTime() - from.getTime()) / DAY_MS > CUSTOM_RANGE_MAX_DAYS) return fail("amplitud");

  return { ok: true, range: { from, to } };
}

/** Las dos fechas de vuelta a `YYYY-MM-DD`, que es como viajan en la URL. */
export function customRangeParams(custom: CustomRange): { desde: string; hasta: string } {
  return { desde: formatDateParam(custom.from), hasta: formatDateParam(new Date(custom.to.getTime() - 1)) };
}
