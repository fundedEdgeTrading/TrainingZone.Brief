import { prisma } from "@/lib/prisma";

export async function getCentersForUser(orgId: string) {
  return prisma.center.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

export async function getWeekSessions(orgId: string, centerId: string, weekStart: Date, weekEnd: Date) {
  const sessions = await prisma.classSession.findMany({
    where: {
      orgId,
      centerId,
      date: { gte: weekStart, lt: weekEnd },
    },
    include: {
      trainer: { select: { name: true } },
      bookings: { select: { id: true, status: true } },
    },
    orderBy: { date: "asc" },
  });
  return sessions;
}

export async function getSessionDetail(orgId: string, sessionId: string) {
  return prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: {
        include: { member: { select: { id: true, firstName: true, lastName: true, state: true } } },
        orderBy: [{ status: "asc" }, { bookedAt: "asc" }],
      },
    },
  });
}
