import { prisma } from "@/lib/prisma";

/**
 * KPIs del panel de dirección en móvil (D1 del handoff): ingresos del mes con
 * su serie de 6 meses, socios activos con altas y bajas, morosidad en importe,
 * y asistencia media. Todo se puede acotar a un centro (`centerId`), que es lo
 * que hacen los chips de la cabecera; el agregado de la organización es el
 * mismo cálculo sin ese filtro.
 */
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type MobileDashboard = Awaited<ReturnType<typeof getMobileDashboard>>;

export async function getMobileDashboard(orgId: string, centerId: string | null) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const seriesStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const memberScope = { orgId, ...(centerId ? { primaryCenterId: centerId } : {}) };
  const paymentScope = { orgId, ...(centerId ? { member: { primaryCenterId: centerId } } : {}) };

  const [activeMembers, newThisMonth, churnedThisMonth, payments, unpaid, attendance] = await Promise.all([
    prisma.member.count({ where: { ...memberScope, state: "ACTIVE" } }),
    prisma.member.count({ where: { ...memberScope, joinedAt: { gte: monthStart } } }),
    prisma.member.count({ where: { ...memberScope, cancelledAt: { gte: monthStart } } }),
    // Serie de 6 meses e ingresos del mes salen del mismo conjunto de cobros.
    prisma.payment.findMany({
      where: { ...paymentScope, status: "PAID", date: { gte: seriesStart } },
      select: { date: true, amountCents: true },
    }),
    prisma.payment.findMany({
      where: { ...paymentScope, status: { in: ["PENDING", "FAILED"] } },
      select: { memberId: true, amountCents: true },
    }),
    prisma.booking.groupBy({
      by: ["status"],
      where: {
        status: { in: ["ATTENDED", "NO_SHOW"] },
        occurrenceDate: { gte: last30 },
        session: { orgId, ...(centerId ? { centerId } : {}) },
      },
      _count: { _all: true },
    }),
  ]);

  // Serie mensual: seis cubos consecutivos, incluidos los meses sin cobros.
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${date.getFullYear()}-${date.getMonth()}`, label: MONTHS_ES[date.getMonth()], cents: 0 };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const payment of payments) {
    const bucket = byKey.get(`${payment.date.getFullYear()}-${payment.date.getMonth()}`);
    if (bucket) bucket.cents += payment.amountCents;
  }

  const monthCents = buckets[buckets.length - 1]?.cents ?? 0;
  const previousCents = buckets[buckets.length - 2]?.cents ?? 0;
  const deltaPct = previousCents > 0 ? Math.round(((monthCents - previousCents) / previousCents) * 1000) / 10 : null;

  const attended = attendance.find((row) => row.status === "ATTENDED")?._count._all ?? 0;
  const noShow = attendance.find((row) => row.status === "NO_SHOW")?._count._all ?? 0;
  const held = attended + noShow;

  return {
    revenue: { monthCents, deltaPct, series: buckets.map(({ label, cents }) => ({ label, cents })) },
    members: { active: activeMembers, newThisMonth, churnedThisMonth },
    delinquency: {
      members: new Set(unpaid.map((p) => p.memberId)).size,
      amountCents: unpaid.reduce((sum, p) => sum + p.amountCents, 0),
    },
    attendance: {
      avgPct: held ? Math.round((attended / held) * 100) : 0,
      noShowPct: held ? Math.round((noShow / held) * 100) : 0,
      sessionsHeld: held,
    },
  };
}
