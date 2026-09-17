import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sessionsInRangeWhere } from "@/lib/session-occurrences";
import {
  OCCUPANCY_SELECT,
  attendancePct,
  heldOccurrences,
  ofKind,
  occurrencesOf,
  noShowPct,
  soldByWeekday,
  soldPct,
  unresolvedRosters,
  type Occurrence,
} from "@/lib/occupancy";
import { nearestOf } from "@/lib/barrio-geometry";
import type { BarrioCenter, BarrioStat } from "@/lib/barrio-map";
import {
  MIN_SAMPLE_PAYMENTS,
  MIN_SAMPLE_REVENUE_CENTS,
  OCCUPANCY_TARGET_PCT,
  TENURE_TARGET_MONTHS,
} from "@/lib/dashboard-targets";
import {
  LIVE_MEMBER_STATES,
  comparisonWindow,
  rangeMeta,
  revenueBuckets,
  sparkBuckets,
  weekBuckets,
  type ComparisonWindow,
  type DashboardOpts,
} from "@/lib/dashboard-range";

export { getLeadCloseRate } from "@/lib/leads-queries";
// El ámbito/periodo se declara en `dashboard-range.ts` (sin Prisma), pero se
// reexporta aquí para que quien consulta no tenga que importar de dos sitios.
export * from "@/lib/dashboard-range";

// ---------- Ámbito del panel de dirección ----------
// Cada modelo cuelga de un centro por un camino distinto y no hay uno solo que
// valga para todos: el socio por `primaryCenterId`, la sesión y el lead por su
// `centerId`, y el cobro por el centro de su socio (Payment no tiene columna de
// centro). Esas tres formas son los tres helpers de aquí abajo. La aritmética
// de tramos y comparativas vive en `dashboard-range.ts`, sin Prisma detrás.

/** Socios del ámbito: el socio pertenece a su centro principal. */
function memberScope(orgId: string, centerId?: string | null) {
  return centerId ? { orgId, primaryCenterId: centerId } : { orgId };
}

/** Cobros del ámbito: `Payment` no tiene centro, lo hereda del socio que paga. */
function paymentScope(orgId: string, centerId?: string | null) {
  return centerId ? { orgId, member: { primaryCenterId: centerId } } : { orgId };
}

/** Sesiones y leads sí llevan su propio `centerId`. */
function centerColumnScope(orgId: string, centerId?: string | null) {
  return centerId ? { orgId, centerId } : { orgId };
}

// ---------- Periodo activo ----------

/**
 * La ventana del selector, resuelta una sola vez por consulta.
 *
 * E14-06 · El diagnóstico de E14-01 encontró que **21 de las 25 consultas del
 * panel recibían `opts.range` y no lo usaban**: unas tenían su propia ventana
 * fija (30 o 60 días, rotulada en la card) y otras agregaban directamente todo
 * el histórico bajo un rótulo que se movía con el selector. El resultado era un
 * panel donde dos cifras contiguas hablaban de periodos distintos.
 *
 * A partir de aquí el criterio es explícito y solo hay tres formas legítimas de
 * tratar el periodo, y cada consulta declara la suya en su comentario:
 *
 * 1. **Sigue la ventana** (`windowOf`): lo normal para una métrica de flujo
 *    —dinero cobrado, altas, leads, sesiones—.
 * 2. **Es un stock**: "cuántos socios hay AHORA" no tiene periodo. Se dice en
 *    el rótulo y no se acota.
 * 3. **Tiene ventana propia por definición**: la tendencia del mapa son sus dos
 *    ventanas de 90 días, las altas y bajas son ocho semanas cerradas. También
 *    se dice en el rótulo.
 *
 * Lo que ya no puede pasar es la cuarta: recibir el rango y no hacer nada con
 * él sin que la pantalla lo diga.
 */
function windowOf(opts: DashboardOpts, now = new Date()): ComparisonWindow {
  return comparisonWindow(opts.range ?? "mes", now, opts.custom);
}

/** Los tramos de la serie de ingresos del periodo activo, con su rótulo. */
function revenueSeriesOf(opts: DashboardOpts, now = new Date()) {
  const range = opts.range ?? "mes";
  return { buckets: revenueBuckets(range, now, opts.custom), meta: rangeMeta(range, opts.custom) };
}

/** Los siete tramos de la sparkline del periodo activo. */
function sparkOf(opts: DashboardOpts, now = new Date()) {
  return sparkBuckets(opts.range ?? "mes", now, opts.custom);
}

/**
 * Serie de ingresos del periodo activo. Los tramos los decide el selector
 * (seis meses, cuatro semanas, el trimestre en curso o diez meses), así que la
 * agregación ya no puede ser un `date_trunc('month')` fijo: se traen los cobros
 * del rango entero y se reparten en los tramos que pida `revenueBuckets`.
 *
 * Se devuelve también la media de la serie: es la línea discontinua dorada que
 * cruza la gráfica, y calcularla aquí evita que la card y el pie de la card
 * puedan discrepar.
 */
export async function getRevenueSeries(orgId: string, opts: DashboardOpts = {}) {
  const { buckets, meta } = revenueSeriesOf(opts);
  const since = buckets[0]?.from ?? new Date();
  const scope = paymentScope(orgId, opts.centerId);

  const [payments, pending] = await Promise.all([
    prisma.payment.findMany({
      where: { ...scope, status: "PAID", date: { gte: since } },
      select: { date: true, amountCents: true },
    }),
    // E14-03: el dinero en vuelo es el de la VENTANA ACTIVA, no el del tramo de
    // la gráfica —que en «mes» son seis meses de contexto—, porque lo que el
    // pie contesta es "¿qué me falta por confirmar de este periodo?".
    pendingInWindow(scope, windowOf(opts)),
  ]);

  const rows = buckets.map((b, i) => {
    const cents = payments
      .filter((p) => p.date >= b.from && p.date < b.to)
      .reduce((sum, p) => sum + p.amountCents, 0);
    return { label: b.label, totalEuros: cents / 100, isCurrent: i === buckets.length - 1 };
  });

  const average = rows.length ? rows.reduce((sum, r) => sum + r.totalEuros, 0) / rows.length : 0;
  return { rows, average, meta, pending };
}

/**
 * E14-03 · el dinero que está en vuelo, para que «Ingresos» no mienta por omisión.
 *
 * `Payment.status = 'PENDING'` es el primer cobro asíncrono sin liquidar: con
 * SEPA Direct Debit tarda días, y mientras tanto la suscripción vive en
 * `PENDING_CONFIRMATION` (ver `stripe-mandate.ts`). Ese euro **no aparecía en
 * ningún sitio del panel**: no está en «Ingresos», que filtra `PAID`, y tampoco
 * en morosidad, que además exige `member.state = 'DELINQUENT'` — y quien tiene
 * el primer adeudo en vuelo no ha impagado nada, todavía no se sabe.
 *
 * No se suma a la cifra grande: mezclar cobrado con en-vuelo convertiría el KPI
 * de caja en una previsión, que es otra cosa. Se devuelve aparte para que la
 * card lo pinte distinguido, y cuando son cero euros —que es lo que midió el
 * diagnóstico contra los datos de demo— no se pinta nada.
 */
export type PendingRevenue = { cents: number; count: number };

async function pendingInWindow(
  scope: Prisma.PaymentWhereInput,
  win: { from: Date; to: Date }
): Promise<PendingRevenue> {
  const agg = await prisma.payment.aggregate({
    where: { ...scope, status: "PENDING", date: { gte: win.from, lt: win.to } },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  return { cents: agg._sum.amountCents ?? 0, count: agg._count._all };
}

/**
 * Importe pendiente de los morosos: SOLO los recibos fallidos/pendientes de
 * quien ya está en `state = 'DELINQUENT'`, la misma definición de moroso que
 * el resto del panel. E12-05: la app móvil contaba `Payment` en
 * PENDING/FAILED sin pasar por el estado del socio ni por ninguna ventana
 * temporal, y le salía un número de morosos distinto al de la web.
 */
export async function getDelinquencyAmount(orgId: string, opts: DashboardOpts = {}): Promise<number> {
  const unpaid = await prisma.payment.findMany({
    where: {
      ...paymentScope(orgId, opts.centerId),
      status: { in: ["PENDING", "FAILED"] },
      member: { state: "DELINQUENT" },
    },
    select: { amountCents: true },
  });
  return unpaid.reduce((sum, p) => sum + p.amountCents, 0);
}

/** Stock: cuántos socios hay AHORA en cada estado. No tiene periodo, y el rótulo lo dice. */
export async function getMemberStateBreakdown(orgId: string, opts: DashboardOpts = {}) {
  const rows = await prisma.member.groupBy({
    by: ["state"],
    where: memberScope(orgId, opts.centerId),
    _count: { _all: true },
  });
  return rows.map((r) => ({ state: r.state, count: r._count._all }));
}

/**
 * Las ocurrencias del ámbito dentro de una ventana, con una sola consulta.
 *
 * E12-06: se traen las filas CANDIDATAS a tener ocurrencias (incluidas las
 * series nacidas antes de la ventana) y se proyectan las ocurrencias reales.
 */
async function occurrencesIn(orgId: string, opts: DashboardOpts, from: Date, to: Date) {
  const sessions = await prisma.classSession.findMany({
    where: {
      ...centerColumnScope(orgId, opts.centerId),
      status: "SCHEDULED",
      ...sessionsInRangeWhere(from, to),
    },
    select: { centerId: true, ...OCCUPANCY_SELECT },
  });
  return { sessions, occurrences: occurrencesOf(sessions, from, to) };
}

/**
 * E14-02 · las dos cifras de ocupación de un juego de ocurrencias, juntas.
 *
 * Van juntas porque se leen juntas: «40 % vendido y 75 % de asistencia» dice
 * algo que ninguna de las dos por separado dice. `sold` incluye las clases que
 * todavía no se han dado (una plaza vendida para el viernes está vendida hoy);
 * `attendance` solo las celebradas, y `unresolved` es la nota al pie que dice
 * sobre cuánta lista sin pasar está calculada.
 */
function occupancyOf(occurrences: Occurrence[], now = new Date()) {
  const group = ofKind(occurrences, "GROUP");
  const ep = ofKind(occurrences, "EP");
  return {
    soldPct: soldPct(occurrences),
    attendancePct: attendancePct(occurrences, now),
    // El EP tiene aforo 1 y llena siempre: promediarlo con el grupo sube la
    // cifra de una parrilla vacía sin que nadie haya llenado una clase.
    groupSoldPct: soldPct(group),
    epSoldPct: soldPct(ep),
    groupSessions: group.length,
    epSessions: ep.length,
    /** Clases ya celebradas: el denominador honesto de "cuántas sesiones hubo". */
    heldSessions: heldOccurrences(occurrences, now).length,
    sessions: occurrences.length,
    unresolved: unresolvedRosters(occurrences, now),
  };
}

export type CenterOccupancy = ReturnType<typeof occupancyOf> & { center: string };

/**
 * Ocupación por centro **del periodo activo**.
 *
 * Antes tenía una ventana fija de 30 días que ignoraba el selector, así que el
 * pie de esta card y el tile de arriba daban dos números distintos bajo la
 * misma palabra (E14-01, cifra 2). Ahora los dos miran lo mismo.
 */
export async function getOccupancyByCenter(orgId: string, opts: DashboardOpts = {}): Promise<CenterOccupancy[]> {
  const now = new Date();
  const win = windowOf(opts, now);
  const [centers, { sessions }] = await Promise.all([
    prisma.center.findMany({
      where: opts.centerId ? { orgId, id: opts.centerId } : { orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    occurrencesIn(orgId, opts, win.from, win.to),
  ]);

  // Una sola consulta y el reparto por centro en memoria: antes era una por
  // centro, y con el selector en "Todos" eso es N viajes para pintar N barras.
  return centers.map((c) => ({
    center: c.name,
    ...occupancyOf(occurrencesOf(sessions.filter((s) => s.centerId === c.id), win.from, win.to), now),
  }));
}

/**
 * Tasa de no presentados del periodo activo, con su comparativa.
 *
 * Sobre las MISMAS ocurrencias ya celebradas que la asistencia real (E14-02):
 * una clase que no se ha dado no tiene no-shows, y contarla como si los tuviera
 * era parte del fallo de la cifra 2 del diagnóstico.
 */
export async function getNoShowRate(orgId: string, opts: DashboardOpts = {}) {
  const now = new Date();
  const win = windowOf(opts, now);
  const { sessions } = await occurrencesIn(orgId, opts, win.prevFrom, win.to);

  const currentOccurrences = occurrencesOf(sessions, win.from, win.to);
  const current = noShowPct(currentOccurrences, now);
  const previousOccurrences = occurrencesOf(sessions, win.prevFrom, win.prevTo);
  const previous = noShowPct(previousOccurrences, now);
  const previousVolume = heldOccurrences(previousOccurrences, now).reduce((sum, o) => sum + o.attended + o.noShow, 0);

  const held = heldOccurrences(currentOccurrences, now);
  const attended = held.reduce((sum, o) => sum + o.attended, 0);
  const noShow = held.reduce((sum, o) => sum + o.noShow, 0);

  // El chip de la card oscura cuenta la variación en puntos, no en porcentaje:
  // "del 8% al 6,6%" es −1,4 pts, no −17,5%.
  return {
    rate: current,
    deltaPts: previousVolume > 0 ? current - previous : null,
    // E12-05: la app móvil necesita el recuento crudo (sesiones held) además
    // de la tasa — se añade aquí para que no tenga que reimplementar esta
    // misma consulta con otro nombre y otro criterio.
    attended,
    noShow,
    held: attended + noShow,
    // E14-02: la asistencia real y la lista sin pasar sobre la que se calcula.
    attendancePct: attendancePct(currentOccurrences, now),
    unresolved: unresolvedRosters(currentOccurrences, now),
    deltaHint: win.deltaHint,
    scopeLabel: win.scopeLabel,
  };
}

/**
 * Plazas vendidas por día de la semana, en el periodo activo.
 *
 * Mide venta y no asistencia: la pregunta es cuál es el día flojo para mover la
 * parrilla, y una plaza vendida a la que luego no se vino sigue siendo demanda.
 */
export async function getOccupancyByWeekday(orgId: string, opts: DashboardOpts = {}) {
  const win = windowOf(opts);
  const { occurrences } = await occurrencesIn(orgId, opts, win.from, win.to);
  // E12-06: cada ocurrencia se imputa a SU día. Con la fecha base, una serie
  // "todos los laborables" cargaba entera en un solo día de la semana.
  const pcts = soldByWeekday(occurrences);
  const labels = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return pcts.map((soldPct, i) => ({ day: labels[i], soldPct }));
}

/** Cobrado por método **en el periodo activo**: antes agregaba todo el histórico. */
export async function getRevenueByMethod(orgId: string, opts: DashboardOpts = {}) {
  const win = windowOf(opts);
  const scope = { ...paymentScope(orgId, opts.centerId), date: { gte: win.from, lt: win.to } };
  // Los fallidos van aparte del cobrado: el pie de la card dice qué método
  // genera más recibos fallidos, y eso hay que contarlo, no suponerlo.
  const [rows, failed] = await Promise.all([
    prisma.payment.groupBy({ by: ["method"], where: { ...scope, status: "PAID" }, _sum: { amountCents: true } }),
    prisma.payment.groupBy({ by: ["method"], where: { ...scope, status: "FAILED" }, _count: { _all: true } }),
  ]);
  return rows.map((r) => ({
    method: r.method,
    totalEuros: (r._sum.amountCents ?? 0) / 100,
    failedCount: failed.find((f) => f.method === r.method)?._count._all ?? 0,
  }));
}

// ---------- F17: BI para dirección (RB-BI-002/003/004) ----------

const MONTH_MS = 2_629_746_000; // mes medio gregoriano: 365,2425 / 12 días

/** Una vida de socio observada: meses transcurridos y si terminó o sigue abierta. */
export type TenureObservation = { months: number; churned: boolean };

export type Tenure = {
  /** Permanencia media medida, en meses. `null` cuando no hay nada que medir. */
  months: number | null;
  /** Hasta dónde se puede medir: la vida de socio más larga que existe. */
  horizonMonths: number;
  /** La media simple de quienes YA se fueron. Es un suelo, no la permanencia. */
  completedMonths: number | null;
  completedCount: number;
  /** Socios vivos: aportan tiempo, no aportan baja (censura por la derecha). */
  censoredCount: number;
  targetMonths: number;
  /**
   * El horizonte no llega a la referencia: comparar contra ella todavía no
   * significa nada. Es el titular de la card cuando es `true`.
   */
  belowHorizon: boolean;
};

/**
 * E14-05 · permanencia media en meses, con la censura por la derecha resuelta.
 *
 * **La decisión, y por qué.** La historia plantea dos opciones y las dos están
 * mal: incluir a los socios vivos con su antigüedad de hoy infravalora la
 * permanencia (todavía les queda por quedarse), y excluirlos la sobrevalora si
 * el negocio es joven (solo se han podido ir los que entraron pronto). Hay una
 * tercera, que es la correcta y la estándar para esto: **Kaplan-Meier**. Los
 * socios vivos no se excluyen ni se cuentan como bajas — entran como
 * observaciones **censuradas**: aportan el tiempo que llevan al denominador de
 * riesgo de cada mes y no aportan ninguna baja. Eso es exactamente "usar lo que
 * se sabe de ellos y no inventar lo que no".
 *
 * Lo que se devuelve es el **área bajo la curva de supervivencia hasta el
 * horizonte de observación** (la vida de socio más larga que existe). En
 * cristiano: los meses que de media aguanta un socio *dentro del tiempo que
 * llevamos mirando*. No se extrapola más allá, y por eso viene acompañado de
 * `horizonMonths`: sin ese dato la cifra se puede comparar con cualquier cosa.
 *
 * **El aviso que importa.** Medido contra los datos de demo en septiembre de
 * 2026, el alta más antigua tiene 23,6 meses y la referencia de negocio son 25.
 * Nadie ha podido quedarse 25 meses: el negocio no existe desde hace 25 meses.
 * Titular "estamos un 70 % por debajo del objetivo" con la media simple de los
 * ocho que se fueron (7,26 meses) sería el mismo error que el insight de la
 * cifra 4 del diagnóstico, con más ceros. De ahí `belowHorizon`.
 */
export function tenureFromObservations(
  observations: TenureObservation[],
  targetMonths = TENURE_TARGET_MONTHS
): Tenure {
  const completed = observations.filter((o) => o.churned);
  const censoredCount = observations.length - completed.length;
  const completedMonths = completed.length
    ? completed.reduce((sum, o) => sum + o.months, 0) / completed.length
    : null;
  const horizonMonths = observations.reduce((max, o) => Math.max(max, o.months), 0);

  const base: Omit<Tenure, "months"> = {
    horizonMonths,
    completedMonths,
    completedCount: completed.length,
    censoredCount,
    targetMonths,
    belowHorizon: horizonMonths < targetMonths,
  };
  if (!observations.length) return { ...base, months: null };

  // Curva de supervivencia: en cada baja, la probabilidad de seguir cae en
  // proporción a cuántos socios estaban en riesgo ESE mes. Quien se dio de alta
  // después no estaba expuesto y no cuenta en ese denominador — que es justo lo
  // que arregla el sesgo del negocio joven.
  const eventTimes = [...new Set(completed.map((o) => o.months))].sort((a, b) => a - b);
  let survival = 1;
  let previous = 0;
  let area = 0;
  for (const t of eventTimes) {
    const atRisk = observations.filter((o) => o.months >= t).length;
    if (!atRisk) break;
    area += survival * (t - previous);
    survival *= 1 - completed.filter((o) => o.months === t).length / atRisk;
    previous = t;
  }
  // El tramo final, en el que ya no hay más bajas observadas.
  area += survival * (horizonMonths - previous);

  return { ...base, months: Math.round(area * 10) / 10 };
}

/**
 * RB-BI-002 / E14-05 · lo que deja un socio y cuánto se queda.
 *
 * Lo que había aquí **no era un LTV**: era la media de todo lo cobrado por
 * socio sobre todo el histórico, sin acotar por `opts.range`, así que devolvía
 * la misma cifra con el selector en «Mes» que en «Año» mientras el resto del
 * panel sí se movía (E14-01). Ahora hay dos piezas y cada una respeta lo que le
 * toca:
 *
 * - **El ritmo** (ticket medio, ingreso por socio y mes) sale de la **ventana
 *   activa**, como cualquier métrica de flujo del panel.
 * - **La duración** (permanencia) es una métrica de cohorte y tiene ventana
 *   propia por definición: se mide sobre toda la vida de los socios, con su
 *   horizonte declarado. Acotarla al mes en curso no daría una permanencia más
 *   corta, daría una permanencia sin sentido.
 *
 * Y el LTV es el producto de las dos, que es la cifra que contesta cuánto se
 * puede gastar en captar a uno nuevo.
 */
export async function getLtvAndTicket(orgId: string, opts: DashboardOpts = {}) {
  const now = new Date();
  const win = windowOf(opts, now);
  const where = {
    ...paymentScope(orgId, opts.centerId),
    status: "PAID" as const,
    date: { gte: win.from, lt: win.to },
  };

  const [byMember, overall, byCenter, members] = await Promise.all([
    prisma.payment.groupBy({ by: ["memberId"], where, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where, _sum: { amountCents: true }, _count: { _all: true } }),
    // El pie de la card dejó de ser un código de regla y pasó a decir qué centro
    // lidera el ticket medio, así que hace falta el desglose por centro.
    prisma.payment.findMany({
      where,
      select: { amountCents: true, member: { select: { primaryCenter: { select: { name: true } } } } },
    }),
    prisma.member.findMany({
      where: { ...memberScope(orgId, opts.centerId), state: { not: "PROSPECT" } },
      select: { joinedAt: true, cancelledAt: true, externalSource: true, externalId: true },
    }),
  ]);

  const revenueCents = overall._sum.amountCents ?? 0;
  const paymentCount = overall._count._all;
  const ticketCents = paymentCount ? revenueCents / paymentCount : 0;

  /**
   * Ingreso por socio y mes: el ritmo al que un socio deja dinero.
   *
   * **Se divide por meses-socio de exposición, no por la duración de la
   * ventana.** Un socio que se dio de alta a mitad del año no ha tenido ocasión
   * de pagar los doce meses, y meterlo entero en el denominador baja el ritmo
   * de todos: medido contra los datos de demo, con el selector en «Año» eso
   * daba 72 €/mes cuando la cuota real son 160 €.
   *
   * Y por eso hay suelo. En una ventana corta o con pocos cobros el ritmo no se
   * puede estimar **en ninguna de las dos direcciones**: el mes en curso a día
   * 15 tiene medio mes de exposición pero todavía no ha entrado ni la mitad de
   * los recibos, así que la división sale disparada o hundida según de qué lado
   * caiga el calendario de cobros. Es el mismo problema que el porcentaje del
   * insight (E14-04), con el mismo umbral y el mismo argumento.
   */
  const memberMonths = members.reduce((sum, m) => sum + exposureMonths(m, win), 0);
  const monthlyArpuCents = hasSample(revenueCents, paymentCount) && memberMonths > 0
    ? revenueCents / memberMonths
    : null;

  const perCenter = new Map<string, { cents: number; count: number }>();
  for (const p of byCenter) {
    const name = p.member?.primaryCenter?.name;
    if (!name) continue;
    const acc = perCenter.get(name) ?? { cents: 0, count: 0 };
    acc.cents += p.amountCents;
    acc.count += 1;
    perCenter.set(name, acc);
  }
  const leader = [...perCenter.entries()]
    .map(([name, v]) => ({ center: name, avgTicketEuros: v.cents / v.count / 100 }))
    .sort((a, b) => b.avgTicketEuros - a.avgTicketEuros)[0];

  /**
   * **Los importados quedan fuera, y se dice cuántos son.**
   *
   * `Member.joinedAt` de un socio importado no es una fecha de alta de este
   * negocio: viene del CSV de la plataforma anterior (`externalSource` /
   * `externalId`, ver `docs/PRODUCTO_GESTION.md` §1.4) y puede ser la fecha de
   * la importación o el alta en la otra casa. Con la primera, la permanencia
   * sale artificialmente corta para todo el que venía de antes; con la segunda,
   * se le estaría atribuyendo a este centro una lealtad que se ganó otro.
   * Ninguna de las dos es medible aquí, así que no se miden: se cuentan y la
   * card lo dice. Si algún día TODOS los socios son importados, la permanencia
   * sale `null` y la card explica por qué, que es mejor que una cifra falsa.
   *
   * Nota del diagnóstico: en la base de demo no hay ni un socio importado, así
   * que esta rama es una regla escrita, no una conclusión de datos.
   */
  const imported = members.filter((m) => m.externalSource !== null || m.externalId !== null);
  const observations: TenureObservation[] = members
    .filter((m) => m.externalSource === null && m.externalId === null)
    .map((m) => ({
      months: Math.max(0, ((m.cancelledAt ?? now).getTime() - m.joinedAt.getTime()) / MONTH_MS),
      churned: m.cancelledAt !== null && m.cancelledAt <= now,
    }));

  const tenure = tenureFromObservations(observations);
  const monthlyArpuEuros = monthlyArpuCents === null ? null : monthlyArpuCents / 100;

  return {
    // El LTV de verdad: lo que deja al mes por lo que se queda. `null` en
    // cuanto falte cualquiera de los dos factores — un LTV a medias no es medio
    // LTV, es un número inventado.
    ltvEuros: tenure.months === null || monthlyArpuEuros === null ? null : monthlyArpuEuros * tenure.months,
    monthlyArpuEuros,
    avgTicketEuros: ticketCents / 100,
    /** Socios con algún cobro EN LA VENTANA, no en todo el histórico. */
    payingMembers: byMember.length,
    paymentCount,
    ticketLeader: leader ?? null,
    tenure: { ...tenure, importedExcluded: imported.length },
    scopeLabel: win.scopeLabel,
  };
}

/**
 * Meses que un socio estuvo dado de alta dentro de la ventana.
 *
 * Es el solape entre su vida como socio —de `joinedAt` a `cancelledAt`, o hasta
 * hoy si sigue— y el periodo que se está mirando. Cero si no se solapan: quien
 * se dio de alta después del periodo no estuvo expuesto a pagarlo.
 */
function exposureMonths(member: { joinedAt: Date; cancelledAt: Date | null }, win: { from: Date; to: Date }): number {
  const start = Math.max(member.joinedAt.getTime(), win.from.getTime());
  const end = Math.min((member.cancelledAt ?? win.to).getTime(), win.to.getTime());
  return Math.max(0, end - start) / MONTH_MS;
}

const BUSINESS_OWNER_KEYWORDS = ["empresari", "autónomo", "autonomo", "ceo", "founder", "fundador", "dueñ", "gerente"];

/** RB-BI-003: edad media, ocupación por frecuencia, % con hijos, % empresarios. */
export async function getMemberDemographics(orgId: string, opts: DashboardOpts = {}) {
  const members = await prisma.member.findMany({
    where: { ...memberScope(orgId, opts.centerId), state: { not: "PROSPECT" } },
    select: { birthDate: true, occupation: true, hasChildren: true },
  });

  const now = Date.now();
  const ages = members.filter((m) => m.birthDate).map((m) => (now - m.birthDate!.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  const avgAge = ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : null;

  const occupationCounts = new Map<string, number>();
  let businessOwners = 0;
  const withOccupation = members.filter((m) => m.occupation);
  for (const m of withOccupation) {
    const key = m.occupation!.trim().toLowerCase();
    occupationCounts.set(key, (occupationCounts.get(key) ?? 0) + 1);
    if (BUSINESS_OWNER_KEYWORDS.some((k) => key.includes(k))) businessOwners++;
  }
  const topOccupations = [...occupationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([occupation, count]) => ({ occupation, count }));

  const withChildrenAnswer = members.filter((m) => m.hasChildren !== null);
  const pctWithChildren = withChildrenAnswer.length
    ? Math.round((withChildrenAnswer.filter((m) => m.hasChildren).length / withChildrenAnswer.length) * 100)
    : null;
  const pctBusinessOwners = withOccupation.length ? Math.round((businessOwners / withOccupation.length) * 100) : null;

  return {
    avgAge: avgAge !== null ? Math.round(avgAge) : null,
    topOccupations,
    pctWithChildren,
    pctBusinessOwners,
    sampleSize: members.length,
  };
}

/**
 * RB-BI-004: seguimiento de objetivos agregado (ClientGoal + SelfAssessment),
 * **del periodo activo**. Antes agregaba todo el histórico junto a cards que sí
 * respetaban el selector: "12 objetivos cumplidos" al lado de "este mes".
 */
export async function getGoalsAggregate(orgId: string, opts: DashboardOpts = {}) {
  const win = windowOf(opts);
  const ofCenter = opts.centerId ? { member: { primaryCenterId: opts.centerId } } : {};
  const created = { createdAt: { gte: win.from, lt: win.to } };
  const [goals, assessments] = await Promise.all([
    prisma.clientGoal.findMany({
      where: { orgId, isTemplate: false, ...ofCenter, ...created },
      select: { achievedAt: true },
    }),
    prisma.selfAssessment.findMany({ where: { orgId, ...ofCenter, ...created }, select: { structured: true } }),
  ]);

  const totalGoals = goals.length;
  const achievedGoals = goals.filter((g) => g.achievedAt).length;

  let stalledCount = 0;
  let wantsMoreCount = 0;
  let changedGoalCount = 0;
  for (const a of assessments) {
    const s = (a.structured ?? {}) as Record<string, unknown>;
    if (s.stalled === true) stalledCount++;
    if (s.wantsMore === true) wantsMoreCount++;
    if (s.changedGoal === true) changedGoalCount++;
  }

  return { totalGoals, achievedGoals, checkins: assessments.length, stalledCount, wantsMoreCount, changedGoalCount };
}

// ---------- BI-3: distribución geográfica por barrio (RB-LEAD-010/RB-BI-003) ----------
// El mapa de calor y el ranking de barrios leen del mismo array
// (getPostalCodeStats), calculado con una única query que hace JOIN contra
// PostalCodeArea (tabla de referencia CP completo→barrio, ver schema.prisma).
// Antes se agrupaba por los 2 primeros dígitos del CP (provincia); con la
// primera puesta en preproducción limitada a Zaragoza capital, se pasó a CP
// completo para tener detalle por barrio en vez de un único punto (Zaragoza
// provincia). Cada tarjeta relanzaba antes su propia agregación en JS y la
// lista se truncaba sin que el mapa lo supiera, así que sus totales podían no
// coincidir — con un único dataset compartido eso deja de ser posible.
//
// El mapa de barrios a pantalla completa (/mapa-barrios) lee de aquí también,
// con cuatro derivados por barrio (conversión, tendencia, distancia y
// oportunidad) y la lista de centros situados. Tres de los cuatro no cuestan
// consulta nueva: salen de los mismos recuentos y de las coordenadas del
// centro. El que sí la cuesta es la tendencia (altas por ventana de 90 días).

/** Ventana de comparación de la tendencia: últimos 90 días contra los 90 previos. */
const TREND_WINDOW_DAYS = 90;

/**
 * Tope de la tendencia, en puntos porcentuales. Un barrio que pasa de 1 alta a
 * 6 es un +500 % que aplasta la rampa divergente de los otros dieciocho: el
 * salto es real pero la escala se la come entera. Se acota, y quien mire la
 * cifra ve el techo, no una variación inventada.
 */
const TREND_CAP = 200;

/** Peso del cliente ya captado en el índice de oportunidad (un lead pesa 1). */
const OPPORTUNITY_MEMBER_WEIGHT = 0.35;

/** Distancia (km) a partir de la cual un barrio se considera desatendido del todo. */
const OPPORTUNITY_SATURATION_KM = 2.6;

export type PostalCodeStat = BarrioStat;

export type PostalCodeMapData = {
  points: BarrioStat[];
  /** Centros de la organización con coordenadas; los que no las tienen no se pueden situar. */
  centers: BarrioCenter[];
};

/**
 * Todos los barrios de la tabla de referencia con sus cifras y derivados, más
 * los centros situados. Sin filtrar ni ordenar: el mapa de barrios necesita
 * también los barrios a cero (son la respuesta a «¿dónde abrir el próximo
 * centro?») y la teselación necesita el juego completo de puntos de la ciudad.
 */
export async function getPostalCodeMapData(orgId: string, opts: DashboardOpts = {}): Promise<PostalCodeMapData> {
  const recentFrom = new Date(Date.now() - TREND_WINDOW_DAYS * 86_400_000);
  const previousFrom = new Date(Date.now() - 2 * TREND_WINDOW_DAYS * 86_400_000);

  // ---- E14-07 · la petición T7 del 6 de septiembre, aplicada ----
  //
  // Los cuatro puntos de `docs/hu/T7-peticion-dashboard-queries.md`. Hasta
  // ahora esta función recibía `opts.range` y `opts.memberStates` y **no usaba
  // ninguno de los dos**: el mapa contaba socios cancelados y todo el histórico
  // mientras el panel de al lado contaba el periodo en curso, con rótulos
  // parecidos. Verificado en el diagnóstico (E14-01): las cuatro salidas del
  // selector eran idénticas hasta el último lead.
  //
  // Nota sobre el punto 1 de la petición: dice que "con `range === 'mes'` el
  // comportamiento tiene que quedar exactamente como está hoy", y eso no se
  // puede cumplir a la vez que su propia prueba nº 4 ni que el criterio de
  // aceptación de E14-07 ("para el mismo periodo y el mismo estado, mapa y
  // panel dan la misma cifra"). Manda el criterio de aceptación: el periodo se
  // aplica también en `mes`, que es el único modo de que las dos pantallas
  // cuenten lo mismo. Es la única desviación, y es deliberada.
  const win = windowOf(opts);
  const memberStates = opts.memberStates ?? LIVE_MEMBER_STATES;
  // Las dos ventanas de 90 días de la TENDENCIA no se acotan: son su propia
  // definición y no dependen del selector (punto 1 de la petición).
  const leadWindow = Prisma.sql`AND "createdAt" >= ${win.from} AND "createdAt" < ${win.to}`;
  const memberWindow = Prisma.sql`AND "joinedAt" >= ${win.from} AND "joinedAt" < ${win.to}`;
  const memberStateFilter = Prisma.sql`AND "state" = ANY(${memberStates}::"MemberState"[])`;
  // El selector de centro filtra los recuentos, no la geografía: los centros
  // siguen situándose todos para que la distancia por barrio (y con ella el
  // índice de oportunidad) no cambie de significado según lo que haya elegido
  // quien mira. `centerIds` (ámbito de center-scope.ts) manda sobre `centerId`
  // (la elección puntual del selector) cuando ambos vienen: sin esto, el mapa
  // de barrios enseñaba siempre leads y socios de TODA la organización, para
  // cualquier rol — no lo acotaba nadie, a diferencia del resto del panel de
  // control.
  const leadCenter =
    opts.centerIds !== undefined
      ? Prisma.sql`AND "centerId" = ANY(${opts.centerIds})`
      : opts.centerId
        ? Prisma.sql`AND "centerId" = ${opts.centerId}`
        : Prisma.empty;
  const memberCenter =
    opts.centerIds !== undefined
      ? Prisma.sql`AND "primaryCenterId" = ANY(${opts.centerIds})`
      : opts.centerId
        ? Prisma.sql`AND "primaryCenterId" = ${opts.centerId}`
        : Prisma.empty;

  const [rows, centerRows, org] = await Promise.all([
    prisma.$queryRaw<
      {
        code: string;
        name: string;
        lat: number;
        lng: number;
        leads: bigint;
        members: bigint;
        recent: bigint;
        previous: bigint;
        churn: bigint;
      }[]
    >`
      SELECT
        pca.code,
        pca.name,
        pca.lat,
        pca.lng,
        COALESCE(l.leads, 0) AS leads,
        COALESCE(m.members, 0) AS members,
        COALESCE(t.recent, 0) AS recent,
        COALESCE(t.previous, 0) AS previous,
        COALESCE(c.churn, 0) AS churn
      FROM "PostalCodeArea" pca
      LEFT JOIN (
        -- E11-01 · fuera los cerrados y los ya convertidos. La misma persona se
        -- contaba como lead Y como socio, y la conversión del barrio se
        -- calculaba sobre ese total inflado.
        SELECT "postalCode" AS code, COUNT(*) AS leads
        FROM "Lead"
        WHERE "orgId" = ${orgId}
          AND "convertedMemberId" IS NULL
          AND "status" <> 'CERRADO'
          ${leadWindow}
          ${leadCenter}
        GROUP BY 1
      ) l ON l.code = pca.code
      LEFT JOIN (
        SELECT "postalCode" AS code, COUNT(*) AS members
        FROM "Member"
        WHERE "orgId" = ${orgId} AND "postalCode" IS NOT NULL
          ${memberStateFilter}
          ${memberWindow}
          ${memberCenter}
        GROUP BY 1
      ) m ON m.code = pca.code
      LEFT JOIN (
        -- La tendencia cuenta ALTAS y va sin filtro de estado a propósito: un
        -- socio que se dio de alta en marzo y se fue en julio se dio de alta
        -- igual, y quitarlo reescribiría el pasado.
        SELECT
          "postalCode" AS code,
          COUNT(*) FILTER (WHERE "joinedAt" >= ${recentFrom}) AS recent,
          COUNT(*) FILTER (WHERE "joinedAt" < ${recentFrom}) AS previous
        FROM "Member"
        WHERE "orgId" = ${orgId} AND "postalCode" IS NOT NULL AND "joinedAt" >= ${previousFrom} ${memberCenter}
        GROUP BY 1
      ) t ON t.code = pca.code
      LEFT JOIN (
        -- E11-09 · bajas del periodo, CON COTA SUPERIOR. Sin ella una baja
        -- programada a futuro contaría ya como baja del periodo en curso y el
        -- mapa de fuga enseñaría barrios que todavía no han perdido a nadie.
        SELECT "postalCode" AS code, COUNT(*) AS churn
        FROM "Member"
        WHERE "orgId" = ${orgId} AND "postalCode" IS NOT NULL
          AND "cancelledAt" >= ${win.from} AND "cancelledAt" < ${win.to}
          ${memberCenter}
        GROUP BY 1
      ) c ON c.code = pca.code
    `,
    prisma.center.findMany({
      where: { orgId, lat: { not: null }, lng: { not: null } },
      select: { id: true, name: true, lat: true, lng: true },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);

  const centers: BarrioCenter[] = centerRows.map((c) => ({
    id: c.id,
    // Sobre el plano el centro se rotula con su nombre corto: "TRAINING ZONE
    // La Jota" repetido en cada marcador es la marca tres veces y el centro
    // ninguna. Misma regla que el subtítulo del header.
    name: shortCenterName(c.name, org?.name),
    lat: c.lat as number,
    lng: c.lng as number,
  }));

  const points = rows.map((r) => {
    const leads = Number(r.leads);
    const members = Number(r.members);
    const total = leads + members;
    const nearest = nearestOf({ lat: r.lat, lng: r.lng }, centers);
    const distKm = nearest?.km ?? 0;

    return {
      code: r.code,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      leads,
      members,
      total,
      conv: Math.round((members / Math.max(1, total)) * 100),
      trend: trendPercent(Number(r.recent), Number(r.previous)),
      // E11-09 · el dato que faltaba para poder responder "¿qué barrios tienen
      // fuga?". `trend` mide altas, y un barrio puede crecer en altas mientras
      // se desangra por detrás.
      churn: Number(r.churn),
      dist: Math.round(distKm * 10) / 10,
      // Demanda que existe pero queda lejos de un centro: un barrio con muchos
      // leads a 3 km de la puerta puntúa alto; el mismo volumen a 500 m no,
      // porque ya está atendido. Fórmula del prototipo, a validar con negocio.
      opp: nearest
        ? Math.round(
            (leads + members * OPPORTUNITY_MEMBER_WEIGHT) * Math.min(1, distKm / OPPORTUNITY_SATURATION_KM) * 10
          ) / 10
        : 0,
      nearestCenter: nearest?.center.name ?? null,
    };
  });

  return { points, centers };
}

/** "TRAINING ZONE La Jota" → "La Jota" cuando el centro lleva delante el nombre de su organización. */
function shortCenterName(name: string, orgName: string | undefined): string {
  if (!orgName) return name;
  return name.toUpperCase().startsWith(orgName.toUpperCase()) ? name.slice(orgName.length).trim() || name : name;
}

/**
 * Variación porcentual de altas entre las dos ventanas.
 *
 * Sin altas previas no hay porcentaje que calcular: un barrio que estrena
 * clientes se marca como crecimiento pleno (+100) en vez de como infinito, y
 * uno sin altas en ninguna de las dos ventanas es un cero, no un vacío.
 */
function trendPercent(recent: number, previous: number): number {
  if (previous === 0) return recent > 0 ? 100 : 0;
  const change = Math.round(((recent - previous) / previous) * 100);
  return Math.max(-TREND_CAP, Math.min(TREND_CAP, change));
}

/**
 * Barrios con datos, de más a menos volumen: lo que consume el mapa de calor
 * del panel.
 *
 * "Con datos" incluye las bajas (E11-09): un barrio del que se ha ido todo el
 * mundo tiene cero socios y cero leads, y es precisamente el que hay que ver.
 */
export async function getPostalCodeStats(orgId: string, opts: DashboardOpts = {}): Promise<PostalCodeStat[]> {
  const { points } = await getPostalCodeMapData(orgId, opts);
  return points.filter((p) => p.total > 0 || (p.churn ?? 0) > 0).sort((a, b) => b.total - a.total);
}

/** Leads mínimos para que un barrio pueda salir como "oportunidad": con dos o tres el ratio es ruido. */
const OPPORTUNITY_MIN_LEADS = 5;

/**
 * Lo que consume la card del mapa de calor: los barrios con datos y el barrio
 * "oportunidad" — el que más leads concentra en proporción a los clientes que
 * ya tiene (mayor `leads / (clientes + 1)`, con al menos cinco leads). Es el
 * chip nuevo de la cabecera: demanda que existe y todavía no se ha convertido.
 */
export async function getPostalPanelData(orgId: string, opts: DashboardOpts = {}) {
  const points = await getPostalCodeStats(orgId, opts);
  const opportunity =
    [...points]
      .filter((p) => p.leads >= OPPORTUNITY_MIN_LEADS)
      .sort((a, b) => b.leads / (b.members + 1) - a.leads / (a.members + 1))[0] ?? null;
  return { points, opportunity };
}

// ---------- BI-2: distribución por sexo (RB-BI-005) ----------

const SEX_LABEL: Record<string, string> = { FEMALE: "Mujer", MALE: "Hombre", OTHER: "Otro" };

/** RB-BI-005: distribución de socios por sexo. "No especificado" se muestra pero se excluye del % sobre respondidos. */
export async function getSexDistribution(orgId: string, opts: DashboardOpts = {}) {
  const rows = await prisma.member.groupBy({
    by: ["sex"],
    where: { ...memberScope(orgId, opts.centerId), state: { not: "PROSPECT" } },
    _count: { _all: true },
  });
  const answered = rows.filter((r) => r.sex !== null);
  const unspecified = rows.find((r) => r.sex === null)?._count._all ?? 0;

  return {
    answered: answered.map((r) => ({ sex: r.sex as string, label: SEX_LABEL[r.sex as string] ?? r.sex, count: r._count._all })),
    unspecified,
    total: rows.reduce((s, r) => s + r._count._all, 0),
  };
}

// ---------- BI-1: franjas de edad, servicio, canal, cierre, ranking (RB-BI-006/007/008/010/011) ----------

const AGE_BRACKETS = [
  { label: "18-25", min: 18, max: 25 },
  { label: "25-35", min: 25, max: 35 },
  { label: "35-45", min: 35, max: 45 },
  { label: "45-55", min: 45, max: 55 },
  { label: "55-65", min: 55, max: 65 },
  { label: "65+", min: 65, max: Infinity },
];

/** RB-BI-006: histograma de socios por franja de edad fija. */
export async function getAgeBrackets(orgId: string, opts: DashboardOpts = {}) {
  const members = await prisma.member.findMany({
    where: { ...memberScope(orgId, opts.centerId), state: { not: "PROSPECT" }, birthDate: { not: null } },
    select: { birthDate: true },
  });
  const now = Date.now();
  const counts = AGE_BRACKETS.map(() => 0);
  for (const m of members) {
    const age = (now - m.birthDate!.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const idx = AGE_BRACKETS.findIndex((b) => age >= b.min && age < b.max);
    if (idx >= 0) counts[idx]++;
  }
  return AGE_BRACKETS.map((b, i) => ({ bracket: b.label, count: counts[i] }));
}

/** RB-BI-007: socios activos agrupados por plan/servicio contratado. */
export async function getMembersByService(orgId: string, opts: DashboardOpts = {}) {
  const [rows, plans] = await Promise.all([
    prisma.subscription.groupBy({
      by: ["planId"],
      // El bono lleva su propio centro (RB-AGENDA-003) y es el que manda: un
      // socio de La Jota con un bono de Santander cuenta donde entrena.
      where: { member: { orgId }, status: "ACTIVE", ...(opts.centerId ? { centerId: opts.centerId } : {}) },
      _count: { _all: true },
    }),
    prisma.membershipPlan.findMany({ where: { orgId }, select: { id: true, name: true, type: true, priceCents: true } }),
  ]);
  return rows
    .map((r) => {
      const plan = plans.find((p) => p.id === r.planId);
      return { planId: r.planId, name: plan?.name ?? "—", type: plan?.type ?? null, priceCents: plan?.priceCents ?? 0, count: r._count._all };
    })
    .sort((a, b) => b.count - a.count);
}

/**
 * RB-BI-008: leads **captados en el periodo activo** agrupados por canal, con
 * cuántos se cerraron. Antes contaba todos los leads de la historia bajo un
 * rótulo que se movía con el selector: el canal que funcionó hace dos años
 * seguía liderando la card de captación de este mes.
 */
export async function getAcquisitionChannels(orgId: string, opts: DashboardOpts = {}) {
  const win = windowOf(opts);
  const where = { ...centerColumnScope(orgId, opts.centerId), createdAt: { gte: win.from, lt: win.to } };
  const [leads, closed] = await Promise.all([
    prisma.lead.groupBy({ by: ["channel"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["channel"], where: { ...where, status: "CERRADO" }, _count: { _all: true } }),
  ]);
  return leads
    .map((l) => ({
      channel: l.channel,
      count: l._count._all,
      closedCount: closed.find((c) => c.channel === l.channel)?._count._all ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * RB-BI-010: ranking de servicios por altas y por ingresos **del periodo
 * activo**. El alta es `startDate` (cuándo empieza a valer el bono) y no
 * `createdAt` (cuándo se tecleó), igual que en el resto del panel.
 */
export async function getTopServices(orgId: string, opts: DashboardOpts & { orderBy?: "count" | "revenue" } = {}) {
  const win = windowOf(opts);
  const [plans, subCounts, payments] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { orgId }, select: { id: true, name: true, type: true } }),
    prisma.subscription.groupBy({
      by: ["planId"],
      where: {
        member: { orgId },
        ...(opts.centerId ? { centerId: opts.centerId } : {}),
        startDate: { gte: win.from, lt: win.to },
      },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: {
        ...paymentScope(orgId, opts.centerId),
        status: "PAID",
        subscriptionId: { not: null },
        date: { gte: win.from, lt: win.to },
      },
      select: { amountCents: true, subscription: { select: { planId: true } } },
    }),
  ]);

  const revenueByPlan = new Map<string, number>();
  for (const p of payments) {
    const planId = p.subscription?.planId;
    if (!planId) continue;
    revenueByPlan.set(planId, (revenueByPlan.get(planId) ?? 0) + p.amountCents);
  }

  const rows = plans.map((plan) => ({
    planId: plan.id,
    name: plan.name,
    type: plan.type,
    subscriptionsCount: subCounts.find((c) => c.planId === plan.id)?._count._all ?? 0,
    revenueEuros: (revenueByPlan.get(plan.id) ?? 0) / 100,
  }));

  const orderBy = opts.orderBy ?? "count";
  return rows.sort((a, b) => (orderBy === "revenue" ? b.revenueEuros - a.revenueEuros : b.subscriptionsCount - a.subscriptionsCount));
}

// RB-BI-011: pesos del score compuesto "mixed" (media ponderada 0-100), centralizados
// aquí para no dispersar números mágicos entre la query y la UI.
export const MEMBER_RANKING_WEIGHTS = { ltv: 0.5, adherence: 0.3, tenure: 0.2 } as const;
/** Ventana de la adherencia del ranking. Exportada porque la card la rotula. */
export const ADHERENCE_PERIOD_DAYS = 90;

export const MEMBER_RANKING_PAGE_SIZE = 10;

/**
 * RB-BI-011: ranking de socios por LTV, adherencia (asistencia/reservas) y
 * antigüedad.
 *
 * **Ventana propia por definición, y la card lo dice.** Es de las pocas que no
 * sigue al selector, y a propósito: las tres dimensiones son de la relación
 * entera con el socio —lo que ha dejado, lo que lleva viniendo, lo que lleva
 * apuntado—, así que acotarlas al periodo activo con el selector en «Hoy»
 * dejaría a todo el mundo a cero y ordenaría la tabla por nada. Lo que sí hacía
 * falta era que el rótulo dejara de callarlo: el `meta` de la card declara el
 * histórico y los {@link ADHERENCE_PERIOD_DAYS} días de la adherencia.
 */
export async function getMemberRanking(
  orgId: string,
  opts: DashboardOpts & { dimension?: "mixed" | "ltv" | "adherence" | "tenure"; dir?: "asc" | "desc" } = {}
) {
  const dimension = opts.dimension ?? "mixed";
  const dir = opts.dir ?? "desc";
  const since = new Date();
  since.setDate(since.getDate() - ADHERENCE_PERIOD_DAYS);

  const members = await prisma.member.findMany({
    where: { ...memberScope(orgId, opts.centerId), state: { not: "PROSPECT" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      joinedAt: true,
      payments: { where: { status: "PAID" }, select: { amountCents: true } },
      bookings: {
        where: { session: { date: { gte: since } }, status: { in: ["ATTENDED", "NO_SHOW"] } },
        select: { status: true },
      },
    },
  });

  const now = Date.now();
  const base = members.map((m) => {
    const ltvEuros = m.payments.reduce((s, p) => s + p.amountCents, 0) / 100;
    const totalBookings = m.bookings.length;
    const attended = m.bookings.filter((b) => b.status === "ATTENDED").length;
    const adherencePct = totalBookings ? Math.round((attended / totalBookings) * 100) : 0;
    const tenureDays = Math.round((now - m.joinedAt.getTime()) / (24 * 60 * 60 * 1000));
    return { memberId: m.id, memberName: `${m.firstName} ${m.lastName}`, ltvEuros, adherencePct, tenureDays };
  });

  const normalize = (values: number[]) => {
    const max = Math.max(1, ...values);
    return (v: number) => (v / max) * 100;
  };
  const normLtv = normalize(base.map((r) => r.ltvEuros));
  const normTenure = normalize(base.map((r) => r.tenureDays));

  const rows = base.map((r) => ({
    ...r,
    mixedScore: Math.round(
      normLtv(r.ltvEuros) * MEMBER_RANKING_WEIGHTS.ltv +
        r.adherencePct * MEMBER_RANKING_WEIGHTS.adherence +
        normTenure(r.tenureDays) * MEMBER_RANKING_WEIGHTS.tenure
    ),
  }));

  const sortKey: Record<string, (r: (typeof rows)[number]) => number> = {
    mixed: (r) => r.mixedScore,
    ltv: (r) => r.ltvEuros,
    adherence: (r) => r.adherencePct,
    tenure: (r) => r.tenureDays,
  };
  const sorted = rows.sort((a, b) =>
    dir === "asc" ? sortKey[dimension](a) - sortKey[dimension](b) : sortKey[dimension](b) - sortKey[dimension](a)
  );

  // La paginación de 27 páginas desaparece del panel: la tabla enseña el top 10
  // y el listado completo vive en Socios (`/members`), que es donde se trabaja.
  return {
    items: sorted.slice(0, MEMBER_RANKING_PAGE_SIZE),
    pageSize: MEMBER_RANKING_PAGE_SIZE,
    total: sorted.length,
    maxLtvEuros: Math.max(1, ...rows.map((r) => r.ltvEuros)),
    maxScore: Math.max(1, ...rows.map((r) => r.mixedScore)),
  };
}

// ---------- Rediseño 2026-08: KPIs con comparativa, altas/bajas e insight ----------


const inWindow = (d: Date, from: Date, to: Date) => d >= from && d < to;

/**
 * Las dos cifras de ocupación del ámbito activo, **en el periodo del selector**.
 *
 * Medias ponderadas: se suman plazas y aforos de todas las sesiones antes de
 * dividir, en vez de promediar los porcentajes de cada centro. Un centro con 4
 * sesiones no puede pesar lo mismo que uno con 90.
 *
 * Tenía una ventana fija de 30 días que ignoraba el selector, y era la mitad de
 * la contradicción de la cifra 2 del diagnóstico: el tile de arriba decía 7 % y
 * el pie de esta card 8 %, con la misma palabra, en la misma pantalla.
 */
export async function getAverageOccupancy(orgId: string, opts: DashboardOpts = {}) {
  const now = new Date();
  const win = windowOf(opts, now);
  const { occurrences } = await occurrencesIn(orgId, opts, win.from, win.to);
  return occupancyOf(occurrences, now);
}

/** Altas menos bajas del periodo activo: el KPI "Altas − bajas" y el neto del panel semanal. */
export async function getNetJoins(orgId: string, opts: DashboardOpts = {}) {
  const { from, to } = windowOf(opts);
  const where = memberScope(orgId, opts.centerId);
  const [joins, cancels] = await Promise.all([
    prisma.member.count({ where: { ...where, joinedAt: { gte: from, lt: to } } }),
    prisma.member.count({ where: { ...where, cancelledAt: { gte: from, lt: to } } }),
  ]);
  return { joins, cancels, net: joins - cancels };
}

/**
 * Altas y bajas por semana ISO, las ocho últimas semanas **cerradas**. La
 * semana en curso se deja fuera a propósito: media semana pintada junto a ocho
 * completas se lee como un desplome que no ha ocurrido.
 *
 * El alta es `joinedAt` (la fecha de alta del negocio, la misma que usan las
 * cohortes) y no `createdAt`, que es cuándo se tecleó la ficha. La baja es
 * `cancelledAt`, que es exactamente la fecha de paso a `CANCELLED`.
 */
export async function getWeeklyChurn(orgId: string, opts: DashboardOpts = {}) {
  const buckets = weekBuckets(9, new Date()).slice(0, 8);
  const where = memberScope(orgId, opts.centerId);
  const from = buckets[0]?.from ?? new Date();
  const to = buckets[buckets.length - 1]?.to ?? new Date();

  const [joined, cancelled] = await Promise.all([
    prisma.member.findMany({ where: { ...where, joinedAt: { gte: from, lt: to } }, select: { joinedAt: true } }),
    prisma.member.findMany({
      where: { ...where, cancelledAt: { gte: from, lt: to } },
      select: { cancelledAt: true },
    }),
  ]);

  const rows = buckets.map((b) => ({
    label: b.label,
    joins: joined.filter((m) => inWindow(m.joinedAt, b.from, b.to)).length,
    cancels: cancelled.filter((m) => m.cancelledAt && inWindow(m.cancelledAt, b.from, b.to)).length,
  }));

  const joins = rows.reduce((s, r) => s + r.joins, 0);
  const cancels = rows.reduce((s, r) => s + r.cancels, 0);
  return { rows, joins, cancels, net: joins - cancels, weeks: rows.length };
}

export type KpiTone = "good" | "bad" | "flat";
export type KpiAccent = "gold" | "ink" | "critical" | "muted";

export type KpiTile = {
  key: string;
  label: string;
  /** Valor numérico para el `CountUp`. En dinero va en céntimos, como el resto del panel. */
  numericValue: number;
  /** El mismo valor ya formateado, para cuando no hay animación. */
  value: string;
  format: "eur" | "int" | "pct" | "signed";
  /** Chip de comparativa. `null` cuando el dato no tiene histórico del que salir. */
  delta: { text: string; tone: KpiTone } | null;
  /**
   * El mismo dato de `delta`, sin formatear (para quien lo necesite en bruto,
   * como la app móvil: E12-05). `null` en los mismos casos que `delta`.
   */
  deltaValue: number | null;
  hint: string;
  accent: KpiAccent;
  /** Siete puntos, los siete últimos tramos de la métrica. */
  spark: number[];
};

const pctChange = (now: number, before: number) => (before === 0 ? null : ((now - before) / before) * 100);

function signedDelta(diff: number, unit: string, goodWhen: "up" | "down"): { text: string; tone: KpiTone } {
  if (diff === 0) return { text: "=", tone: "flat" };
  const up = diff > 0;
  const magnitude = `${Math.abs(diff).toLocaleString("es-ES", { maximumFractionDigits: 1 })}${unit}`;
  // La flecha cuenta la dirección real del dato; el color, la lectura de
  // negocio: morosos a la baja es dorado, riesgo al alza es terracota.
  return { text: `${up ? "↑" : "↓"} ${magnitude}`, tone: (goodWhen === "up") === up ? "good" : "bad" };
}

/**
 * Los ocho tiles de la fila de KPIs, con su chip de comparativa y su sparkline.
 *
 * Cuatro consultas para ocho tiles: se traen las filas crudas del periodo más
 * largo que se necesita y el reparto en tramos se hace en memoria. Una consulta
 * por tile y tramo serían más de cincuenta viajes a la base para pintar una fila.
 *
 * Morosos y congelados salen sin comparativa a propósito: `MemberState` no tiene
 * histórico —no hay tabla de cambios de estado— así que cualquier "hace un mes
 * eran once" sería inventado. Se pintan con el chip `=`, que es lo que el diseño
 * ya reserva para "sin cambios".
 */
export async function getKpiTiles(orgId: string, opts: DashboardOpts = {}): Promise<KpiTile[]> {
  const now = new Date();
  const win = windowOf(opts, now);
  const buckets = sparkOf(opts, now);
  const since = new Date(Math.min(buckets[0].from.getTime(), win.prevFrom.getTime()));
  const members = memberScope(orgId, opts.centerId);

  const [memberRows, stateCounts, payments, sessions, alerts] = await Promise.all([
    prisma.member.findMany({ where: members, select: { joinedAt: true, cancelledAt: true } }),
    prisma.member.groupBy({ by: ["state"], where: members, _count: { _all: true } }),
    prisma.payment.findMany({
      where: { ...paymentScope(orgId, opts.centerId), status: "PAID", date: { gte: since } },
      select: { date: true, amountCents: true },
    }),
    prisma.classSession.findMany({
      where: {
        ...centerColumnScope(orgId, opts.centerId),
        status: "SCHEDULED",
        ...sessionsInRangeWhere(since, now),
      },
      select: OCCUPANCY_SELECT,
    }),
    prisma.retentionAlert.findMany({ where: { member: members }, select: { createdAt: true, resolvedAt: true } }),
  ]);

  const stateCount = (state: string) => stateCounts.find((r) => r.state === state)?._count._all ?? 0;
  const revenueCents = (from: Date, to: Date) =>
    payments.filter((p) => inWindow(p.date, from, to)).reduce((sum, p) => sum + p.amountCents, 0);
  // E12-06: la ventana se resuelve por OCURRENCIA, no filtrando la fecha base
  // de la fila. Así una serie de hace seis meses aporta sus clases de este mes,
  // y una cuya base cae dentro no aporta todo su histórico de golpe.
  const sessionsIn = (from: Date, to: Date) => occurrencesOf(sessions, from, to);
  // Stock a fecha `t`: quien ya se había dado de alta y todavía no se había ido.
  const activeAt = (t: Date) =>
    memberRows.filter((m) => m.joinedAt <= t && (!m.cancelledAt || m.cancelledAt > t)).length;
  const alertsAt = (t: Date) =>
    alerts.filter((a) => a.createdAt <= t && (!a.resolvedAt || a.resolvedAt > t)).length;
  const netJoinsIn = (from: Date, to: Date) =>
    memberRows.filter((m) => inWindow(m.joinedAt, from, to)).length -
    memberRows.filter((m) => m.cancelledAt && inWindow(m.cancelledAt, from, to)).length;

  const revenue = revenueCents(win.from, win.to);
  const revenuePrev = revenueCents(win.prevFrom, win.prevTo);
  const revenueChange = pctChange(revenue, revenuePrev);

  const activeMembers = stateCount("ACTIVE");
  // E14-02: el tile es PLAZAS VENDIDAS, no "ocupación" a secas. La asistencia
  // real vive en su propia card, con la lista sin pasar al pie: son dos
  // preguntas y el diagnóstico encontró que juntarlas es lo que hacía que un
  // 2 % no significara nada.
  const sold = soldPct(sessionsIn(win.from, win.to));
  const soldPrev = soldPct(sessionsIn(win.prevFrom, win.prevTo));
  // Sesiones ya CELEBRADAS: contar la agenda de esta tarde como "sesiones de
  // este mes" infla el ritmo con clases que todavía no han ocurrido.
  const sessionCount = heldOccurrences(sessionsIn(win.from, win.to), now).length;
  const sessionCountPrev = heldOccurrences(sessionsIn(win.prevFrom, win.prevTo), now).length;
  const openAlerts = alertsAt(now);
  const delinquent = stateCount("DELINQUENT");
  const frozen = stateCount("FROZEN");
  const net = netJoinsIn(win.from, win.to);
  const netPrev = netJoinsIn(win.prevFrom, win.prevTo);

  // "Mejor mes del trimestre" no es una frase de relleno: se comprueba contra
  // los dos tramos anteriores antes de escribirla.
  const netLastThree = buckets.slice(-3).map((b) => netJoinsIn(b.from, b.to));
  const bestOfQuarter = netLastThree.length === 3 && netLastThree[2] >= Math.max(...netLastThree);

  const eur = (cents: number) =>
    (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const flat = (v: number) => buckets.map(() => v);

  return [
    {
      key: "revenue",
      label: `Ingresos ${win.scopeLabel}`,
      numericValue: revenue,
      value: eur(revenue),
      format: "eur",
      delta:
        revenueChange === null
          ? null
          : signedDelta(Math.round(revenueChange * 10) / 10, "%", "up"),
      deltaValue: revenueChange === null ? null : Math.round(revenueChange * 10) / 10,
      hint: win.deltaHint,
      accent: "gold",
      spark: buckets.map((b) => revenueCents(b.from, b.to) / 100),
    },
    {
      key: "activeMembers",
      label: "Socios activos",
      numericValue: activeMembers,
      value: String(activeMembers),
      format: "int",
      delta: signedDelta(activeAt(now) - activeAt(win.prevTo), "", "up"),
      deltaValue: activeAt(now) - activeAt(win.prevTo),
      hint: "altas menos bajas",
      accent: "ink",
      spark: buckets.map((b) => activeAt(b.to)),
    },
    {
      key: "occupancy",
      label: "Plazas vendidas",
      numericValue: sold,
      value: `${sold}%`,
      format: "pct",
      delta: signedDelta(sold - soldPrev, Math.abs(sold - soldPrev) === 1 ? " pt" : " pts", "up"),
      deltaValue: sold - soldPrev,
      hint: `del aforo · objetivo ${OCCUPANCY_TARGET_PCT}%`,
      accent: "ink",
      spark: buckets.map((b) => soldPct(sessionsIn(b.from, b.to))),
    },
    {
      key: "sessions",
      label: `Sesiones ${win.sessionsScopeLabel}`,
      numericValue: sessionCount,
      value: String(sessionCount),
      format: "int",
      delta: signedDelta(sessionCount - sessionCountPrev, "", "up"),
      deltaValue: sessionCount - sessionCountPrev,
      hint: "clases ya celebradas",
      accent: "ink",
      spark: buckets.map((b) => heldOccurrences(sessionsIn(b.from, b.to), now).length),
    },
    {
      key: "risk",
      label: "Socios en riesgo de fuga",
      numericValue: openAlerts,
      value: String(openAlerts),
      format: "int",
      delta: signedDelta(openAlerts - alertsAt(win.prevTo), "", "down"),
      deltaValue: openAlerts - alertsAt(win.prevTo),
      hint: "marcados en Socios",
      accent: "critical",
      spark: buckets.map((b) => alertsAt(b.to)),
    },
    {
      key: "delinquent",
      label: "Morosos",
      numericValue: delinquent,
      value: String(delinquent),
      format: "int",
      delta: null,
      deltaValue: null,
      hint: "recibos fallidos",
      accent: "critical",
      spark: flat(delinquent),
    },
    {
      key: "frozen",
      label: "Congelados",
      numericValue: frozen,
      value: String(frozen),
      format: "int",
      delta: null,
      deltaValue: null,
      hint: "sin cambios",
      accent: "muted",
      spark: flat(frozen),
    },
    {
      key: "net",
      label: `Altas − bajas ${win.scopeLabel}`,
      numericValue: net,
      value: `${net > 0 ? "+" : ""}${net}`,
      format: "signed",
      delta: signedDelta(net - netPrev, "", "up"),
      deltaValue: net - netPrev,
      hint: bestOfQuarter ? "mejor tramo del trimestre" : win.deltaHint,
      accent: "gold",
      spark: buckets.map((b) => netJoinsIn(b.from, b.to)),
    },
  ];
}

export type DailyInsight = { text: string; ctaLabel: string; ctaHref: string };

const sum = (payments: { date: Date; amountCents: number }[], from: Date, to: Date) =>
  payments.filter((p) => inWindow(p.date, from, to)).reduce((s, p) => s + p.amountCents, 0);

/**
 * ¿Da la ventana para derivar algo de sus cobros? El umbral y su argumento
 * están en `dashboard-targets.ts`; aquí solo se aplica, y en los dos sitios
 * que lo necesitan, para que no se puedan separar.
 */
const hasSample = (cents: number, count: number) =>
  count >= MIN_SAMPLE_PAYMENTS && cents >= MIN_SAMPLE_REVENUE_CENTS;

/**
 * E14-04 · la frase de ingresos del insight, con suelo.
 *
 * Lo que había: `if (revenue > 0 && change !== null)` escribía "los ingresos
 * van un X % abajo" en cuanto hubiera un euro. Con cinco cobros y 561 € eso
 * producía un "82,5 % abajo" que un solo recibo cruzando el borde de la ventana
 * movía ocho puntos (E14-01, cifra 4).
 *
 * Por debajo del suelo —{@link MIN_SAMPLE_PAYMENTS} recibos o
 * {@link MIN_SAMPLE_REVENUE_CENTS}, ambos justificados en `dashboard-targets`—
 * la frase **no desaparece**: callarse del todo también informa mal, porque el
 * lector no distingue "no hay dato" de "no ha pasado nada". Dice el número
 * absoluto y cuántos recibos lo sostienen, que es lo que se sabe de verdad.
 */
function revenuePhrase(
  cents: number,
  count: number,
  change: number | null,
  prevLabel: string,
  scopeLabel: string
): string | null {
  if (cents <= 0) return null;

  if (!hasSample(cents, count)) {
    const amount = (cents / 100).toLocaleString("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
    return `Llevas ${amount} cobrados ${scopeLabel}, en ${count} ${count === 1 ? "recibo" : "recibos"}: son pocos para sacar un porcentaje.`;
  }

  if (change === null) return null;
  const pretty = Math.abs(change).toLocaleString("es-ES", { maximumFractionDigits: 1 });
  return `Los ingresos van un ${pretty}% ${change >= 0 ? "arriba" : "abajo"} respecto a ${prevLabel}.`;
}

/**
 * Las tres frases de la banda oscura. Se escriben en servidor a partir de los
 * datos que el panel ya calcula — no hay IA detrás — y en este orden: el centro
 * con mejor ocupación y su variación, cómo van los ingresos, y la señal a
 * vigilar. Cada frase solo se escribe si su dato existe: sin cobros no se dice
 * nada de ingresos, en vez de rellenar con un 0%.
 */
export async function getDailyInsight(orgId: string, opts: DashboardOpts = {}): Promise<DailyInsight | null> {
  const now = new Date();
  const win = windowOf(opts, now);
  const members = memberScope(orgId, opts.centerId);

  const [sessions, payments, alerts, centers] = await Promise.all([
    prisma.classSession.findMany({
      where: {
        ...centerColumnScope(orgId, opts.centerId),
        status: "SCHEDULED",
        ...sessionsInRangeWhere(win.prevFrom, win.to),
      },
      select: { centerId: true, ...OCCUPANCY_SELECT },
    }),
    prisma.payment.findMany({
      where: { ...paymentScope(orgId, opts.centerId), status: "PAID", date: { gte: win.prevFrom } },
      select: { date: true, amountCents: true },
    }),
    prisma.retentionAlert.findMany({
      where: { status: "OPEN", member: members },
      select: { member: { select: { postalCode: true } } },
    }),
    prisma.center.findMany({
      where: opts.centerId ? { orgId, id: opts.centerId } : { orgId },
      select: { id: true, name: true },
    }),
  ]);

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  const sentences: string[] = [];

  // (a) El centro que lidera la ocupación y cuánto se mueve.
  const ranked = centers
    .map((c) => {
      const own = sessions.filter((x) => x.centerId === c.id);
      const current = occurrencesOf(own, win.from, win.to);
      return {
        name: shortCenterName(c.name, org?.name),
        // E14-02: plazas vendidas. "Ocupación" a secas es la palabra que el
        // diagnóstico encontró que significaba tres cosas a la vez.
        pct: soldPct(current),
        prevPct: soldPct(occurrencesOf(own, win.prevFrom, win.prevTo)),
        sessions: current.length,
      };
    })
    .filter((c) => c.sessions > 0)
    .sort((a, b) => b.pct - a.pct);

  const leader = ranked[0];
  if (leader) {
    const diff = leader.pct - leader.prevPct;
    const movement =
      diff === 0
        ? `, igual que ${win.prevLabel}`
        : `, ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "punto" : "puntos"} ${diff > 0 ? "por encima de" : "por debajo de"} ${win.prevLabel}`;
    sentences.push(
      ranked.length > 1
        ? `${leader.name} lidera con un ${leader.pct}% de plazas vendidas${movement}.`
        : `${leader.name} tiene vendido el ${leader.pct}% del aforo${movement}.`
    );
  }

  // (b) Cómo van los ingresos — con suelo, para no dar porcentajes sobre ruido.
  const inRange = payments.filter((p) => inWindow(p.date, win.from, win.to));
  const revenue = inRange.reduce((s, p) => s + p.amountCents, 0);
  const change = pctChange(revenue, sum(payments, win.prevFrom, win.prevTo));
  const revenueSentence = revenuePhrase(revenue, inRange.length, change, win.prevLabel, win.scopeLabel);
  if (revenueSentence) sentences.push(revenueSentence);

  // (c) La señal a vigilar: cuántos socios en riesgo y dónde se concentran.
  if (alerts.length > 0) {
    const byCode = new Map<string, number>();
    for (const a of alerts) {
      const code = a.member?.postalCode;
      if (code) byCode.set(code, (byCode.get(code) ?? 0) + 1);
    }
    const top = [...byCode.entries()].sort((a, b) => b[1] - a[1])[0];
    const area = top
      ? await prisma.postalCodeArea.findUnique({ where: { code: top[0] }, select: { name: true } })
      : null;
    const where = area && top && top[1] > 1 ? `, ${top[1]} de ellos en ${area.name}` : "";
    sentences.push(
      `La señal a mirar hoy ${alerts.length === 1 ? "es el socio marcado" : `son los ${alerts.length} socios marcados`} en riesgo de fuga${where}.`
    );
  }

  if (sentences.length === 0) return null;

  return {
    text: sentences.join(" "),
    ctaLabel: alerts.length > 0 ? "Ver socios en riesgo" : "Ver agenda de clases",
    ctaHref: alerts.length > 0 ? "/members" : "/agenda",
  };
}
