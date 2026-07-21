import { prisma } from "@/lib/prisma";

export async function getMemberForUser(userId: string) {
  return prisma.member.findFirst({
    where: { userId },
    include: {
      primaryCenter: true,
      subscriptions: { where: { status: "ACTIVE" }, include: { plan: true }, orderBy: { startDate: "desc" } },
    },
  });
}

export async function getMemberProgress(memberId: string) {
  const bookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED" },
    select: { session: { select: { date: true } } },
    orderBy: { session: { date: "asc" } },
  });
  const dates = bookings.map((b) => b.session.date);

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalThisYear = dates.filter((d) => d >= yearStart).length;
  const totalThisMonth = dates.filter((d) => d >= monthStart).length;

  const byMonth = new Map<string, number>();
  for (const d of dates) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  let bestMonthCount = 0;
  let bestMonthLabel = "";
  for (const [key, count] of byMonth) {
    if (count > bestMonthCount) {
      bestMonthCount = count;
      const [y, m] = key.split("-").map(Number);
      bestMonthLabel = new Date(y, m, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    }
  }

  return {
    totalAllTime: dates.length,
    totalThisYear,
    totalThisMonth,
    bestMonthCount,
    bestMonthLabel,
  };
}

export async function getMemberMonthlyActivity(memberId: string, months = 6) {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const bookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED", session: { date: { gte: since } } },
    select: { session: { select: { date: true } } },
  });

  const counts = new Map<string, number>();
  for (const b of bookings) {
    const d = b.session.date;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: { label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    result.push({ label: d.toLocaleDateString("es-ES", { month: "short" }), count: counts.get(key) ?? 0 });
  }
  return result;
}

export async function getMemberGoals(memberId: string) {
  return prisma.clientGoal.findMany({ where: { memberId, isTemplate: false }, orderBy: { createdAt: "desc" } });
}

export async function getMemberHealthTransparency(memberId: string, orgId: string) {
  const records = await prisma.healthRecord.findMany({
    where: { memberId, status: "ACTIVE" },
    select: { zone: true, type: true },
  });
  if (records.length === 0) return [];

  const rules = await prisma.aptitudeRule.findMany({ where: { orgId } });
  return records
    .filter((r) => r.zone)
    .flatMap((r) => rules.filter((rule) => rule.injuryZone === r.zone))
    .map((r) => ({ blockArea: r.blockArea, light: r.light, adaptation: r.adaptation }));
}

const BOOKING_WINDOW_DAYS = 7; // RB-RES-002
const MIN_LEAD_MINUTES = 30; // RB-RES-001
const CANCEL_WINDOW_HOURS = 4; // RB-RES-005

/**
 * RB-AGENDA-001: visibilidad segmentada. El socio de grupos ve las clases de
 * grupo (siempre reservables por el cliente, con aforo). El socio de EP solo
 * ve las franjas de SU entrenador marcadas como autorreservables
 * (`selfBookable`, RB-AGENDA-002) — el resto de huecos de EP los gestiona el
 * entrenador a mano y no aparecen aquí.
 */
export async function getBookableSessions(
  orgId: string,
  centerId: string,
  memberId: string,
  memberContext: { trainerId: string | null; hasGroupService: boolean; hasEpService: boolean } = { trainerId: null, hasGroupService: true, hasEpService: false }
) {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const sessions = await prisma.classSession.findMany({
    where: {
      orgId,
      centerId,
      status: "SCHEDULED",
      date: { gte: new Date(now.toDateString()), lt: windowEnd },
      OR: [
        ...(memberContext.hasGroupService ? [{ classType: { not: "Personal Training" } }] : []),
        ...(memberContext.hasEpService && memberContext.trainerId
          ? [{ classType: "Personal Training", selfBookable: true, trainerId: memberContext.trainerId }]
          : []),
      ],
    },
    include: {
      trainer: { select: { name: true } },
      bookings: { select: { id: true, memberId: true, status: true } },
    },
    orderBy: { date: "asc" },
  });

  return sessions
    .map((s) => {
      const [h, m] = s.startTime.split(":").map(Number);
      const startsAt = new Date(s.date);
      startsAt.setHours(h, m, 0, 0);
      const activeBookings = s.bookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW");
      const myBooking = s.bookings.find((b) => b.memberId === memberId && (b.status === "BOOKED" || b.status === "WAITLISTED"));
      return {
        id: s.id,
        name: s.name,
        classType: s.classType,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        bookedCount: activeBookings.length,
        trainerName: s.trainer?.name ?? null,
        startsAt,
        canBook: startsAt.getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60 * 1000,
        myBookingId: myBooking?.id ?? null,
        myBookingStatus: myBooking?.status ?? null,
      };
    })
    .filter((s) => s.canBook || s.myBookingId);
}

export function canCancelWithoutPenalty(startsAt: Date) {
  return startsAt.getTime() - Date.now() >= CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
}
