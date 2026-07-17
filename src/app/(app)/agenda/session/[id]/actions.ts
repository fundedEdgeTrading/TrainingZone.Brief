"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export async function toggleCheckIn(bookingId: string, sessionId: string) {
  await requireSession();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;

  const newStatus = booking.status === "ATTENDED" ? "BOOKED" : "ATTENDED";
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: newStatus,
      checkedInAt: newStatus === "ATTENDED" ? new Date() : null,
    },
  });
  revalidatePath(`/agenda/session/${sessionId}`);
}
