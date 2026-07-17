"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";

export async function bookSession(sessionId: string) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return;

  const cls = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { bookings: { select: { status: true } } },
  });
  if (!cls || cls.status !== "SCHEDULED") return;

  const existing = await prisma.booking.findFirst({
    where: { sessionId, memberId: member.id, status: { in: ["BOOKED", "WAITLISTED"] } },
  });
  if (existing) return;

  const activeCount = cls.bookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW").length;
  const overCapacity = activeCount >= cls.capacity;

  // RB-RES-004: máximo 3 reservas futuras simultáneas.
  const futureBookings = await prisma.booking.count({
    where: {
      memberId: member.id,
      status: "BOOKED",
      session: { date: { gte: new Date(new Date().toDateString()) } },
    },
  });
  if (!overCapacity && futureBookings >= 3) return;

  await prisma.booking.create({
    data: {
      sessionId,
      memberId: member.id,
      status: overCapacity ? "WAITLISTED" : "BOOKED",
      waitlistPosition: overCapacity ? activeCount - cls.capacity + 1 : null,
    },
  });

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
}

export async function cancelMyBooking(bookingId: string) {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return;

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, memberId: member.id } });
  if (!booking) return;

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
}
