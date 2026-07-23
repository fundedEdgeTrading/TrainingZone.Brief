import { prisma } from "@/lib/prisma";
import { buildCompositionView } from "@/lib/composition-view";

// RB-PERFIL-004/portal: el socio ve su propio seguimiento de fotos y evolución (misma vista
// de composición corporal que su entrenador consulta en la ficha del socio), sujeto a los
// mismos consentimientos (Art. 9 RGPD) que ya firmó en su onboarding.
export async function getMemberEvolution(memberId: string, orgId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      birthDate: true,
      consentHealth: true,
      consentImages: true,
      progressEntries: { orderBy: { date: "desc" } },
    },
  });
  if (!member) return null;

  const view = await buildCompositionView(orgId, member.birthDate, member.progressEntries);
  return {
    consentHealth: member.consentHealth,
    consentImages: member.consentImages,
    progressEntries: member.progressEntries,
    ...view,
  };
}

export async function getMemberForUser(userId: string) {
  return prisma.member.findFirst({
    where: { userId },
    include: {
      primaryCenter: true,
      subscriptions: { where: { status: "ACTIVE" }, include: { plan: true }, orderBy: { startDate: "desc" } },
      trainer: { select: { name: true } },
    },
  });
}

// FB-2/RB-FB-102: sesiones recientes marcadas ATTENDED sin feedback del cliente todavía
// (SelfAssessment kind="post-sesion" con bookingId en structured, ver submitPostSessionFeedback).
export async function getPendingSessionFeedback(memberId: string) {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const attended = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED", session: { date: { gte: since } } },
    select: {
      id: true,
      session: { select: { name: true, date: true, startTime: true, classType: true, trainer: { select: { name: true } } } },
    },
    orderBy: { session: { date: "desc" } },
    take: 5,
  });
  if (attended.length === 0) return [];

  const given = await prisma.selfAssessment.findMany({
    where: { memberId, kind: "post-sesion" },
    select: { structured: true },
  });
  const answeredBookingIds = new Set(
    given.map((g) => (g.structured as { bookingId?: string } | null)?.bookingId).filter((id): id is string => !!id)
  );

  return attended
    .filter((b) => !answeredBookingIds.has(b.id))
    .map((b) => ({
      bookingId: b.id,
      sessionName: b.session.name,
      sessionDate: b.session.date,
      time: b.session.startTime,
      focus: b.session.classType,
      trainerName: b.session.trainer?.name ?? null,
    }));
}

export async function getPendingSessionFeedbackCountForUser(userId: string) {
  const member = await prisma.member.findFirst({ where: { userId }, select: { id: true } });
  if (!member) return 0;
  return (await getPendingSessionFeedback(member.id)).length;
}

// Medias mostradas en "Mi plan": valoración al entrenador (TrainerRating.score,
// 1-10) y autoevaluación (media de energía+RPE de los SelfAssessment "post-sesion").
export async function getMemberRatingSummary(memberId: string) {
  const [trainerAgg, selfRows] = await Promise.all([
    prisma.trainerRating.aggregate({
      where: { memberId, score: { not: null } },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.selfAssessment.findMany({ where: { memberId, kind: "post-sesion" }, select: { structured: true } }),
  ]);

  const selfScores = selfRows
    .map((r) => r.structured as { energy?: number; rpe?: number } | null)
    .filter((s): s is { energy: number; rpe: number } => typeof s?.energy === "number" && typeof s?.rpe === "number")
    .map((s) => (s.energy + s.rpe) / 2);
  const selfAvg = selfScores.length ? selfScores.reduce((a, b) => a + b, 0) / selfScores.length : null;

  return {
    trainerAvg: trainerAgg._avg.score,
    trainerCount: trainerAgg._count._all,
    selfAvg,
    selfCount: selfScores.length,
  };
}

// Adherencia del hero de "Mi plan": de las sesiones que el socio reservó y ya
// tuvieron lugar en las últimas 4 semanas (asistidas + no-shows), cuántas asistió.
export async function getMemberPlanAdherence(memberId: string) {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // lunes de esta semana

  const bookings = await prisma.booking.findMany({
    where: { memberId, status: { in: ["ATTENDED", "NO_SHOW"] }, session: { date: { gte: since } } },
    select: { status: true, session: { select: { date: true } } },
  });

  const committed = bookings.length;
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const pct = committed > 0 ? Math.round((attended / committed) * 100) : null;
  const avgPerWeek = Math.round(committed / 4);

  const weekBookings = bookings.filter((b) => b.session.date >= weekStart);
  const weekCommitted = weekBookings.length;
  const weekAttended = weekBookings.filter((b) => b.status === "ATTENDED").length;

  // Racha: semanas consecutivas (terminando en la actual) con al menos una sesión asistida.
  const attendedBookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED" },
    select: { session: { select: { date: true } } },
  });
  const attendedWeeks = new Set(
    attendedBookings.map(({ session }) => {
      const d = new Date(session.date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getTime();
    })
  );
  let streakWeeks = 0;
  const cursor = new Date(weekStart);
  while (attendedWeeks.has(cursor.getTime())) {
    streakWeeks++;
    cursor.setDate(cursor.getDate() - 7);
  }

  return { pct, attended, committed, avgPerWeek, weekAttended, weekCommitted, streakWeeks };
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
