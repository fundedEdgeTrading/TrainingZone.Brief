import { prisma } from "@/lib/prisma";
import { coordsForPostalPrefix } from "@/lib/postal-codes-es";
export { getLeadCloseRate } from "@/lib/leads-queries";

export async function getKpis(orgId: string) {
  const [activeMembers, delinquent, frozen, openAlerts, monthRevenue, sessionsThisMonth] =
    await Promise.all([
      prisma.member.count({ where: { orgId, state: "ACTIVE" } }),
      prisma.member.count({ where: { orgId, state: "DELINQUENT" } }),
      prisma.member.count({ where: { orgId, state: "FROZEN" } }),
      prisma.retentionAlert.count({ where: { status: "OPEN", member: { orgId } } }),
      prisma.payment.aggregate({
        where: {
          orgId,
          status: "PAID",
          date: { gte: startOfMonth(new Date()) },
        },
        _sum: { amountCents: true },
      }),
      prisma.classSession.count({
        where: { orgId, date: { gte: startOfMonth(new Date()) }, status: "SCHEDULED" },
      }),
    ]);

  return {
    activeMembers,
    delinquent,
    frozen,
    openAlerts,
    monthRevenueCents: monthRevenue._sum.amountCents ?? 0,
    sessionsThisMonth,
  };
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function getRevenueByMonth(orgId: string, months = 6) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);

  const rows = await prisma.$queryRaw<{ month: Date; total: bigint }[]>`
    SELECT date_trunc('month', "date") as month, SUM("amountCents") as total
    FROM "Payment"
    WHERE "orgId" = ${orgId} AND "status" = 'PAID'
      AND "date" >= ${since}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return rows.map((r) => ({
    month: r.month,
    totalEuros: Number(r.total) / 100,
  }));
}

export async function getMemberStateBreakdown(orgId: string) {
  const rows = await prisma.member.groupBy({
    by: ["state"],
    where: { orgId },
    _count: { _all: true },
  });
  return rows.map((r) => ({ state: r.state, count: r._count._all }));
}

export async function getOccupancyByCenter(orgId: string) {
  const centers = await prisma.center.findMany({ where: { orgId } });
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

export async function getNoShowRate(orgId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const [attended, noShow] = await Promise.all([
    prisma.booking.count({
      where: { status: "ATTENDED", session: { orgId, date: { gte: since } } },
    }),
    prisma.booking.count({
      where: { status: "NO_SHOW", session: { orgId, date: { gte: since } } },
    }),
  ]);
  const total = attended + noShow;
  return total ? Math.round((noShow / total) * 100) : 0;
}

export async function getOccupancyByWeekday(orgId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 60);
  const sessions = await prisma.classSession.findMany({
    where: { orgId, date: { gte: since, lt: new Date() }, status: "SCHEDULED" },
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

export async function getCohortRetention(orgId: string, months = 6) {
  const now = new Date();
  const results = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const cohort = await prisma.member.findMany({
      where: { orgId, joinedAt: { gte: monthStart, lt: monthEnd } },
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

export async function getRevenueByMethod(orgId: string) {
  const rows = await prisma.payment.groupBy({
    by: ["method"],
    where: { orgId, status: "PAID" },
    _sum: { amountCents: true },
  });
  return rows.map((r) => ({ method: r.method, totalEuros: (r._sum.amountCents ?? 0) / 100 }));
}

// ---------- F17: BI para dirección (RB-BI-002/003/004) ----------

/** RB-BI-002: LTV medio por cliente y ticket medio por cobro. */
export async function getLtvAndTicket(orgId: string) {
  const [byMember, overall] = await Promise.all([
    prisma.payment.groupBy({ by: ["memberId"], where: { orgId, status: "PAID" }, _sum: { amountCents: true } }),
    prisma.payment.aggregate({ where: { orgId, status: "PAID" }, _sum: { amountCents: true }, _count: { _all: true } }),
  ]);
  const ltvCents = byMember.length ? byMember.reduce((s, m) => s + (m._sum.amountCents ?? 0), 0) / byMember.length : 0;
  const ticketCents = overall._count._all ? (overall._sum.amountCents ?? 0) / overall._count._all : 0;
  return { ltvEuros: ltvCents / 100, avgTicketEuros: ticketCents / 100, payingMembers: byMember.length };
}

const BUSINESS_OWNER_KEYWORDS = ["empresari", "autónomo", "autonomo", "ceo", "founder", "fundador", "dueñ", "gerente"];

/** RB-BI-003: edad media, ocupación por frecuencia, % con hijos, % empresarios. */
export async function getMemberDemographics(orgId: string) {
  const members = await prisma.member.findMany({
    where: { orgId, state: { not: "PROSPECT" } },
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
export async function getGoalsAggregate(orgId: string) {
  const [goals, assessments] = await Promise.all([
    prisma.clientGoal.findMany({ where: { orgId, isTemplate: false }, select: { achievedAt: true } }),
    prisma.selfAssessment.findMany({ where: { orgId }, select: { structured: true } }),
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

/** RB-LEAD-010/RB-BI-003: distribución de leads/clientes por código postal (proxy del mapa de radios). */
export async function getPostalCodeDistribution(orgId: string) {
  const [leads, members] = await Promise.all([
    prisma.lead.findMany({ where: { orgId }, select: { postalCode: true } }),
    prisma.member.findMany({ where: { orgId, postalCode: { not: null } }, select: { postalCode: true } }),
  ]);

  const counts = new Map<string, { leads: number; members: number }>();
  for (const l of leads) {
    const prefix = l.postalCode.slice(0, 2);
    const row = counts.get(prefix) ?? { leads: 0, members: 0 };
    row.leads++;
    counts.set(prefix, row);
  }
  for (const m of members) {
    const prefix = m.postalCode!.slice(0, 2);
    const row = counts.get(prefix) ?? { leads: 0, members: 0 };
    row.members++;
    counts.set(prefix, row);
  }

  return [...counts.entries()]
    .map(([prefix, v]) => ({ prefix, ...v, total: v.leads + v.members }))
    .sort((a, b) => b.total - a.total);
}

// ---------- BI-3: mapa de calor real por CP (upgrade RB-LEAD-010) ----------

/** Une getPostalCodeDistribution con la tabla CP→coordenadas para alimentar el heatmap. */
export async function getPostalCodeHeatmapPoints(orgId: string) {
  const distribution = await getPostalCodeDistribution(orgId);
  return distribution
    .map((d) => {
      const coords = coordsForPostalPrefix(d.prefix);
      if (!coords) return null;
      return { lat: coords.lat, lng: coords.lng, name: coords.name, count: d.total };
    })
    .filter((p): p is { lat: number; lng: number; name: string; count: number } => p !== null);
}

// ---------- BI-2: distribución por sexo (RB-BI-005) ----------

const SEX_LABEL: Record<string, string> = { FEMALE: "Mujer", MALE: "Hombre", OTHER: "Otro" };

/** RB-BI-005: distribución de socios por sexo. "No especificado" se muestra pero se excluye del % sobre respondidos. */
export async function getSexDistribution(orgId: string) {
  const rows = await prisma.member.groupBy({
    by: ["sex"],
    where: { orgId, state: { not: "PROSPECT" } },
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
export async function getAgeBrackets(orgId: string) {
  const members = await prisma.member.findMany({
    where: { orgId, state: { not: "PROSPECT" }, birthDate: { not: null } },
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
export async function getMembersByService(orgId: string) {
  const [rows, plans] = await Promise.all([
    prisma.subscription.groupBy({
      by: ["planId"],
      where: { member: { orgId }, status: "ACTIVE" },
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
export async function getAcquisitionChannels(orgId: string) {
  const [leads, closed] = await Promise.all([
    prisma.lead.groupBy({ by: ["channel"], where: { orgId }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["channel"], where: { orgId, status: "CERRADO" }, _count: { _all: true } }),
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
export async function getTopServices(orgId: string, opts: { orderBy?: "count" | "revenue" } = {}) {
  const [plans, subCounts, payments] = await Promise.all([
    prisma.membershipPlan.findMany({ where: { orgId }, select: { id: true, name: true, type: true } }),
    prisma.subscription.groupBy({ by: ["planId"], where: { member: { orgId } }, _count: { _all: true } }),
    prisma.payment.findMany({
      where: { orgId, status: "PAID", subscriptionId: { not: null } },
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

/** RB-BI-011: ranking de socios por LTV, adherencia (asistencia/reservas) y antigüedad. */
export async function getMemberRanking(orgId: string, opts: { dimension?: "mixed" | "ltv" | "adherence" | "tenure" } = {}) {
  const dimension = opts.dimension ?? "mixed";
  const since = new Date();
  since.setDate(since.getDate() - ADHERENCE_PERIOD_DAYS);

  const members = await prisma.member.findMany({
    where: { orgId, state: { not: "PROSPECT" } },
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
  return rows.sort((a, b) => sortKey[dimension](b) - sortKey[dimension](a));
}
