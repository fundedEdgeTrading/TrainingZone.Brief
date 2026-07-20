import { prisma } from "@/lib/prisma";

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
