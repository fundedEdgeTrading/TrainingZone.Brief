"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canViewSessionDebrief } from "@/lib/rbac";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import type { DebriefFeeling } from "@prisma/client";

export type DebriefActionResult = { ok: true } | { ok: false; error: string };

// Session Debrief (G.1): un toque por persona, <20s para 8 personas.
export async function setDebrief(
  bookingId: string,
  sessionId: string,
  feeling: DebriefFeeling
): Promise<DebriefActionResult> {
  const session = await requireSession();

  // La reserva tiene que ser de una sesión de tu organización y que puedas
  // abrir: sin esto bastaba con estar autenticado (un socio incluido) para
  // marcar el debrief de cualquier reserva conociendo su id.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId: session.user.orgId } },
    select: { session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };
  if (!canViewSessionDebrief(session.user.role, session.user.id, booking.session)) {
    return { ok: false, error: "No tienes permiso para registrar el debrief de esta sesión." };
  }

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

  revalidateSessionViews(sessionId);
  return { ok: true };
}
