"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import type { DebriefFeeling } from "@prisma/client";

// Session Debrief (G.1): un toque por persona, <20s para 8 personas.
export async function setDebrief(bookingId: string, sessionId: string, feeling: DebriefFeeling) {
  await requireSession();

  await prisma.sessionDebrief.upsert({
    where: { bookingId },
    create: { bookingId, feeling },
    update: { feeling },
  });

  // Un debrief implica que la persona asistió.
  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "ATTENDED", checkedInAt: new Date() },
  });

  revalidatePath(`/brief/${sessionId}`);
}
