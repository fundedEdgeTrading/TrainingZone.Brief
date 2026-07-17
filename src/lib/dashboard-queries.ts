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
