"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export type CheckInActionResult = { ok: true; checkedIn: boolean } | { ok: false; error: string };

export async function toggleCheckIn(bookingId: string, sessionId: string): Promise<CheckInActionResult> {
  await requireSession();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };

  const newStatus = booking.status === "ATTENDED" ? "BOOKED" : "ATTENDED";
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: newStatus,
      checkedInAt: newStatus === "ATTENDED" ? new Date() : null,
    },
  });
  revalidatePath(`/agenda/session/${sessionId}`);
  return { ok: true, checkedIn: newStatus === "ATTENDED" };
}
