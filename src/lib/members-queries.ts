import { prisma } from "@/lib/prisma";
import type { MemberState } from "@prisma/client";

export async function listMembers(
  orgId: string,
  opts: { q?: string; state?: MemberState; centerId?: string } = {}
) {
  return prisma.member.findMany({
    where: {
      orgId,
      primaryCenterId: opts.centerId || undefined,
      state: opts.state || undefined,
      ...(opts.q
        ? {
            OR: [
              { firstName: { contains: opts.q, mode: "insensitive" } },
              { lastName: { contains: opts.q, mode: "insensitive" } },
              { email: { contains: opts.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      primaryCenter: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
    orderBy: [{ state: "asc" }, { lastName: "asc" }],
    take: 300,
  });
}

export async function getMemberDetail(orgId: string, memberId: string) {
  return prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      primaryCenter: true,
      subscriptions: { include: { plan: true }, orderBy: { startDate: "desc" } },
      payments: { orderBy: { date: "desc" }, take: 24 },
      bookings: {
        orderBy: { bookedAt: "desc" },
        take: 30,
        include: { session: true, debrief: true },
      },
    },
  });
}

export async function getMemberNotes(orgId: string, memberId: string) {
  return prisma.memberNote.findMany({
    where: { orgId, memberId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMemberAttendanceStats(memberId: string) {
  const bookings = await prisma.booking.findMany({
    where: { memberId },
    include: { session: true },
  });
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
  const total = attended + noShow;
  return {
    attended,
    noShow,
    cancelled,
    noShowRate: total ? Math.round((noShow / total) * 100) : 0,
  };
}
