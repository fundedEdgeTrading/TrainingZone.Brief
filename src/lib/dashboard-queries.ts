import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { nearestOf } from "@/lib/barrio-geometry";
import type { BarrioCenter, BarrioStat } from "@/lib/barrio-map";
import { OCCUPANCY_TARGET_PCT } from "@/lib/dashboard-targets";
import {
  comparisonWindow,
  revenueBuckets,
  sparkBuckets,
  weekBuckets,
  DASHBOARD_RANGES,
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
  const range = opts.range ?? "mes";
  const buckets = revenueBuckets(range);
  const since = buckets[0]?.from ?? new Date();

  const payments = await prisma.payment.findMany({
    where: { ...paymentScope(orgId, opts.centerId), status: "PAID", date: { gte: since } },
    select: { date: true, amountCents: true },
  });

  const rows = buckets.map((b, i) => {
    const cents = payments
      .filter((p) => p.date >= b.from && p.date < b.to)
      .reduce((sum, p) => sum + p.amountCents, 0);
    return { label: b.label, totalEuros: cents / 100, isCurrent: i === buckets.length - 1 };
  });

  const average = rows.length ? rows.reduce((sum, r) => sum + r.totalEuros, 0) / rows.length : 0;
  return { rows, average, meta: DASHBOARD_RANGES.find((r) => r.id === range)?.meta ?? "" };
}

export async function getMemberStateBreakdown(orgId: string, opts: DashboardOpts = {}) {
  const rows = await prisma.member.groupBy({
    by: ["state"],
    where: memberScope(orgId, opts.centerId),
    _count: { _all: true },
  });
  return rows.map((r) => ({ state: r.state, count: r._count._all }));
}

export async function getOccupancyByCenter(orgId: string, opts: DashboardOpts = {}) {
  const centers = await prisma.center.findMany({
    where: opts.centerId ? { orgId, id: opts.centerId } : { orgId },
    orderBy: { name: "asc" },
  });
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const result = [];
  for (const c of centers) {
    const sessions = await prisma.classSession.findMany({
      where: { orgId, centerId: c.id, date: { gte: since, lt: new Date() }, status: "SCHEDULED" },
      select: {
        capacity: true,
        bookings: { where: { status: { in: ["ATTENDED", "NO_SHOW"] } }, select: { id: true } },
      },
    });
    const totalCapacity = sessions.reduce((s, x) => s + x.capacity, 0);
    const totalBooked = sessions.reduce((s, x) => s + x.bookings.length, 0);
    result.push({
      center: c.name,
      occupancyPct: totalCapacity ? Math.round((totalBooked / totalCapacity) * 100) : 0,
      sessions: sessions.length,
    });
  }
  return result;
}

export async function getNoShowRate(orgId: string, opts: DashboardOpts = {}) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const previousSince = new Date(since.getTime() - 30 * 86_400_000);
  const session = { ...centerColumnScope(orgId, opts.centerId) };

  const [attended, noShow, prevAttended, prevNoShow] = await Promise.all([
    prisma.booking.count({ where: { status: "ATTENDED", session: { ...session, date: { gte: since } } } }),
    prisma.booking.count({ where: { status: "NO_SHOW", session: { ...session, date: { gte: since } } } }),
    prisma.booking.count({
      where: { status: "ATTENDED", session: { ...session, date: { gte: previousSince, lt: since } } },
    }),
    prisma.booking.count({
      where: { status: "NO_SHOW", session: { ...session, date: { gte: previousSince, lt: since } } },
    }),
  ]);

  const rate = (no: number, yes: number) => (no + yes ? Math.round((no / (no + yes)) * 100) : 0);
  const current = rate(noShow, attended);
  const previous = rate(prevNoShow, prevAttended);
  // El chip de la card oscura cuenta la variación en puntos, no en porcentaje:
  // "del 8% al 6,6%" es −1,4 pts, no −17,5%.
  return { rate: current, deltaPts: previousSince && prevAttended + prevNoShow > 0 ? current - previous : null };
}

export async function getOccupancyByWeekday(orgId: string, opts: DashboardOpts = {}) {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const sessions = await prisma.classSession.findMany({
    where: { ...centerColumnScope(orgId, opts.centerId), date: { gte: since, lt: new Date() }, status: "SCHEDULED" },
    select: {
      date: true,
      capacity: true,
      bookings: { where: { status: { in: ["ATTENDED", "NO_SHOW"] } }, select: { id: true } },
    },
  });
  const byWeekday = Array.from({ length: 7 }, () => ({ capacity: 0, booked: 0 }));
  for (const s of sessions) {
    const wd = new Date(s.date).getDay();
    byWeekday[wd].capacity += s.capacity;
    byWeekday[wd].booked += s.bookings.length;
  }
  const labels = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  return byWeekday.map((v, i) => ({
    day: labels[i],
    occupancyPct: v.capacity ? Math.round((v.booked / v.capacity) * 100) : 0,
  }));
}

export async function getCohortRetention(orgId: string, opts: DashboardOpts & { months?: number } = {}) {
  const months = opts.months ?? 6;
  const now = new Date();
  const results = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const cohort = await prisma.member.findMany({
      where: { ...memberScope(orgId, opts.centerId), joinedAt: { gte: monthStart, lt: monthEnd } },
      select: { state: true },
    });
    const total = cohort.length;
    const stillActive = cohort.filter((m) => m.state === "ACTIVE" || m.state === "DELINQUENT" || m.state === "FROZEN").length;
    results.push({
      month: monthStart.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
      total,
      retainedPct: total ? Math.round((stillActive / total) * 100) : 0,
    });
  }
  return results;
}

export async function getRevenueByMethod(orgId: string, opts: DashboardOpts = {}) {
  const scope = paymentScope(orgId, opts.centerId);
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

/** RB-BI-002: LTV medio por cliente y ticket medio por cobro. */
export async function getLtvAndTicket(orgId: string, opts: DashboardOpts = {}) {
  const where = { ...paymentScope(orgId, opts.centerId), status: "PAID" as const };
  const [byMember, overall, byCenter] = await Promise.all([
    prisma.payment.groupBy({ by: ["memberId"], where, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where, _sum: { amountCents: true }, _count: { _all: true } }),
    // El pie de la card dejó de ser un código de regla y pasó a decir qué centro
    // lidera el ticket medio, así que hace falta el desglose por centro.
    prisma.payment.findMany({
      where,
      select: { amountCents: true, member: { select: { primaryCenter: { select: { name: true } } } } },
    }),
  ]);
  const ltvCents = byMember.length ? byMember.reduce((s, m) => s + (m._sum.amountCents ?? 0), 0) / byMember.length : 0;
  const ticketCents = overall._count._all ? (overall._sum.amountCents ?? 0) / overall._count._all : 0;

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

  return {
    ltvEuros: ltvCents / 100,
    avgTicketEuros: ticketCents / 100,
    payingMembers: byMember.length,
    ticketLeader: leader ?? null,
  };
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

/** RB-BI-004: seguimiento de objetivos agregado (a partir de ClientGoal + SelfAssessment). */
export async function getGoalsAggregate(orgId: string, opts: DashboardOpts = {}) {
  const ofCenter = opts.centerId ? { member: { primaryCenterId: opts.centerId } } : {};
  const [goals, assessments] = await Promise.all([
    prisma.clientGoal.findMany({ where: { orgId, isTemplate: false, ...ofCenter }, select: { achievedAt: true } }),
    prisma.selfAssessment.findMany({ where: { orgId, ...ofCenter }, select: { structured: true } }),
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
  // El selector de centro filtra los recuentos, no la geografía: los centros
  // siguen situándose todos para que la distancia por barrio (y con ella el
  // índice de oportunidad) no cambie de significado según lo que haya elegido
  // quien mira.
  const leadCenter = opts.centerId ? Prisma.sql`AND "centerId" = ${opts.centerId}` : Prisma.empty;
  const memberCenter = opts.centerId ? Prisma.sql`AND "primaryCenterId" = ${opts.centerId}` : Prisma.empty;

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
        COALESCE(t.previous, 0) AS previous
      FROM "PostalCodeArea" pca
      LEFT JOIN (
        SELECT "postalCode" AS code, COUNT(*) AS leads
        FROM "Lead"
        WHERE "orgId" = ${orgId} ${leadCenter}
        GROUP BY 1
      ) l ON l.code = pca.code
      LEFT JOIN (
        SELECT "postalCode" AS code, COUNT(*) AS members
        FROM "Member"
        WHERE "orgId" = ${orgId} AND "postalCode" IS NOT NULL ${memberCenter}
        GROUP BY 1
      ) m ON m.code = pca.code
      LEFT JOIN (
        SELECT
          "postalCode" AS code,
          COUNT(*) FILTER (WHERE "joinedAt" >= ${recentFrom}) AS recent,
          COUNT(*) FILTER (WHERE "joinedAt" < ${recentFrom}) AS previous
        FROM "Member"
        WHERE "orgId" = ${orgId} AND "postalCode" IS NOT NULL AND "joinedAt" >= ${previousFrom} ${memberCenter}
        GROUP BY 1
      ) t ON t.code = pca.code
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

/** Barrios con datos, de más a menos volumen: lo que consume el mapa de calor del panel. */
export async function getPostalCodeStats(orgId: string, opts: DashboardOpts = {}): Promise<PostalCodeStat[]> {
  const { points } = await getPostalCodeMapData(orgId, opts);
  return points.filter((p) => p.total > 0).sort((a, b) => b.total - a.total);
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

/** RB-BI-008: leads agrupados por canal de origen, con nº de cerrados por canal. */
export async function getAcquisitionChannels(orgId: string, opts: DashboardOpts = {}) {
  const where = centerColumnScope(orgId, opts.centerId);
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

/** RB-BI-010: ranking de servicios por nº de altas y por ingresos asociados. */
export async function getTopServices(orgId: string, opts: DashboardOpts & { orderBy?: "count" | "revenue" } = {}) {
  const [plans, subCounts, payments] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { orgId }, select: { id: true, name: true, type: true } }),
    prisma.subscription.groupBy({
      by: ["planId"],
      where: { member: { orgId }, ...(opts.centerId ? { centerId: opts.centerId } : {}) },
      _count: { _all: true },
    }),
    prisma.payment.findMany({
      where: { ...paymentScope(orgId, opts.centerId), status: "PAID", subscriptionId: { not: null } },
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
const ADHERENCE_PERIOD_DAYS = 90;

export const MEMBER_RANKING_PAGE_SIZE = 10;

/** RB-BI-011: ranking de socios por LTV, adherencia (asistencia/reservas) y antigüedad. */
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


type SessionRow = { date: Date; capacity: number; bookings: { id: string }[] };

function occupancyOf(sessions: SessionRow[]) {
  const capacity = sessions.reduce((s, x) => s + x.capacity, 0);
  const booked = sessions.reduce((s, x) => s + x.bookings.length, 0);
  return capacity ? Math.round((booked / capacity) * 100) : 0;
}

const inWindow = (d: Date, from: Date, to: Date) => d >= from && d < to;

/**
 * Ocupación media ponderada del ámbito activo: se suman plazas y reservas de
 * todas las sesiones antes de dividir, en vez de promediar los porcentajes de
 * cada centro. Un centro con 4 sesiones no puede pesar lo mismo que uno con 90.
 */
export async function getAverageOccupancy(orgId: string, opts: DashboardOpts = {}) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sessions = await prisma.classSession.findMany({
    where: { ...centerColumnScope(orgId, opts.centerId), date: { gte: since, lt: new Date() }, status: "SCHEDULED" },
    select: {
      date: true,
      capacity: true,
      bookings: { where: { status: { in: ["ATTENDED", "NO_SHOW"] } }, select: { id: true } },
    },
  });
  return occupancyOf(sessions);
}

/** Altas menos bajas del periodo activo: el KPI "Altas − bajas" y el neto del panel semanal. */
export async function getNetJoins(orgId: string, opts: DashboardOpts = {}) {
  const { from, to } = comparisonWindow(opts.range ?? "mes");
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
  const range = opts.range ?? "mes";
  const win = comparisonWindow(range);
  const buckets = sparkBuckets(range);
  const since = new Date(Math.min(buckets[0].from.getTime(), win.prevFrom.getTime()));
  const now = new Date();
  const members = memberScope(orgId, opts.centerId);

  const [memberRows, stateCounts, payments, sessions, alerts] = await Promise.all([
    prisma.member.findMany({ where: members, select: { joinedAt: true, cancelledAt: true } }),
    prisma.member.groupBy({ by: ["state"], where: members, _count: { _all: true } }),
    prisma.payment.findMany({
      where: { ...paymentScope(orgId, opts.centerId), status: "PAID", date: { gte: since } },
      select: { date: true, amountCents: true },
    }),
    prisma.classSession.findMany({
      where: { ...centerColumnScope(orgId, opts.centerId), date: { gte: since }, status: "SCHEDULED" },
      select: {
        date: true,
        capacity: true,
        bookings: { where: { status: { in: ["ATTENDED", "NO_SHOW"] } }, select: { id: true } },
      },
    }),
    prisma.retentionAlert.findMany({ where: { member: members }, select: { createdAt: true, resolvedAt: true } }),
  ]);

  const stateCount = (state: string) => stateCounts.find((r) => r.state === state)?._count._all ?? 0;
  const revenueCents = (from: Date, to: Date) =>
    payments.filter((p) => inWindow(p.date, from, to)).reduce((sum, p) => sum + p.amountCents, 0);
  const sessionsIn = (from: Date, to: Date) => sessions.filter((x) => inWindow(x.date, from, to));
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
  const occupancy = occupancyOf(sessionsIn(win.from, win.to));
  const occupancyPrev = occupancyOf(sessionsIn(win.prevFrom, win.prevTo));
  const sessionCount = sessionsIn(win.from, win.to).length;
  const sessionCountPrev = sessionsIn(win.prevFrom, win.prevTo).length;
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
      hint: "altas menos bajas",
      accent: "ink",
      spark: buckets.map((b) => activeAt(b.to)),
    },
    {
      key: "occupancy",
      label: "Ocupación media",
      numericValue: occupancy,
      value: `${occupancy}%`,
      format: "pct",
      delta: signedDelta(occupancy - occupancyPrev, Math.abs(occupancy - occupancyPrev) === 1 ? " pt" : " pts", "up"),
      hint: `objetivo ${OCCUPANCY_TARGET_PCT}%`,
      accent: "ink",
      spark: buckets.map((b) => occupancyOf(sessionsIn(b.from, b.to))),
    },
    {
      key: "sessions",
      label: `Sesiones ${win.sessionsScopeLabel}`,
      numericValue: sessionCount,
      value: String(sessionCount),
      format: "int",
      delta: signedDelta(sessionCount - sessionCountPrev, "", "up"),
      hint: "ritmo de agenda",
      accent: "ink",
      spark: buckets.map((b) => sessionsIn(b.from, b.to).length),
    },
    {
      key: "risk",
      label: "Socios en riesgo de fuga",
      numericValue: openAlerts,
      value: String(openAlerts),
      format: "int",
      delta: signedDelta(openAlerts - alertsAt(win.prevTo), "", "down"),
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
      hint: bestOfQuarter ? "mejor tramo del trimestre" : win.deltaHint,
      accent: "gold",
      spark: buckets.map((b) => netJoinsIn(b.from, b.to)),
    },
  ];
}

export type DailyInsight = { text: string; ctaLabel: string; ctaHref: string };

/**
 * Las tres frases de la banda oscura. Se escriben en servidor a partir de los
 * datos que el panel ya calcula — no hay IA detrás — y en este orden: el centro
 * con mejor ocupación y su variación, cómo van los ingresos, y la señal a
 * vigilar. Cada frase solo se escribe si su dato existe: sin cobros no se dice
 * nada de ingresos, en vez de rellenar con un 0%.
 */
export async function getDailyInsight(orgId: string, opts: DashboardOpts = {}): Promise<DailyInsight | null> {
  const range = opts.range ?? "mes";
  const win = comparisonWindow(range);
  const members = memberScope(orgId, opts.centerId);

  const [sessions, payments, alerts, centers] = await Promise.all([
    prisma.classSession.findMany({
      where: { ...centerColumnScope(orgId, opts.centerId), date: { gte: win.prevFrom }, status: "SCHEDULED" },
      select: {
        centerId: true,
        date: true,
        capacity: true,
        bookings: { where: { status: { in: ["ATTENDED", "NO_SHOW"] } }, select: { id: true } },
      },
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
      return {
        name: shortCenterName(c.name, org?.name),
        pct: occupancyOf(own.filter((x) => inWindow(x.date, win.from, win.to))),
        prevPct: occupancyOf(own.filter((x) => inWindow(x.date, win.prevFrom, win.prevTo))),
        sessions: own.length,
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
        ? `${leader.name} lidera con un ${leader.pct}% de ocupación${movement}.`
        : `${leader.name} está al ${leader.pct}% de ocupación${movement}.`
    );
  }

  // (b) Cómo van los ingresos, y si es el mejor tramo del trimestre.
  const sum = (from: Date, to: Date) =>
    payments.filter((p) => inWindow(p.date, from, to)).reduce((s, p) => s + p.amountCents, 0);
  const revenue = sum(win.from, win.to);
  const change = pctChange(revenue, sum(win.prevFrom, win.prevTo));
  if (revenue > 0 && change !== null) {
    const pretty = Math.abs(change).toLocaleString("es-ES", { maximumFractionDigits: 1 });
    sentences.push(`Los ingresos van un ${pretty}% ${change >= 0 ? "arriba" : "abajo"} respecto a ${win.prevLabel}.`);
  }

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
