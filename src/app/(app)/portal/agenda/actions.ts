"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";

export type BookingActionResult =
  | { ok: true; waitlisted: boolean }
  | { ok: false; error: string };

export async function bookSession(sessionId: string): Promise<BookingActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const cls = await prisma.classSession.findUnique({
    where: { id: sessionId },
    include: { bookings: { select: { status: true } } },
  });
  if (!cls || cls.status !== "SCHEDULED") {
    return { ok: false, error: "Esta clase ya no está disponible para reservar." };
  }

  const existing = await prisma.booking.findFirst({
    where: { sessionId, memberId: member.id, status: { in: ["BOOKED", "WAITLISTED"] } },
  });
  if (existing) return { ok: false, error: "Ya tienes una reserva para esta clase." };

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
  if (!overCapacity && futureBookings >= 3) {
    return { ok: false, error: "Ya tienes 3 reservas activas: cancela alguna para reservar otra." };
  }

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
  return { ok: true, waitlisted: overCapacity };
}

export async function cancelMyBooking(bookingId: string): Promise<BookingActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "No se ha encontrado tu ficha de socio." };

  const booking = await prisma.booking.findFirst({ where: { id: bookingId, memberId: member.id } });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  revalidatePath("/portal/agenda");
  revalidatePath("/portal");
  return { ok: true, waitlisted: false };
}
