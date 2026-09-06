"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { canViewSessionDebrief } from "@/lib/rbac";
import { centerIsInScope } from "@/lib/guard";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { bookingTransitionMessage, checkBookingTransition, statusesEndingAt } from "@/lib/booking-transitions";
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
    // `status` para la máquina de estados (E2-02) y `centerId` para el ámbito
    // de centro (E1-01): las dos comprobaciones cuelgan de la misma lectura.
    select: { status: true, session: { select: { centerId: true, trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };

  // E1-01: si el brief de esa sesión no se puede abrir por ámbito de centro,
  // tampoco se puede escribir su debrief. `canViewSessionDebrief` mira el rol y
  // quién dirigió la sesión, nunca el centro.
  if (!(await centerIsInScope(session.user, booking.session.centerId))) {
    return { ok: false, error: "No se ha encontrado esa reserva." };
  }

  if (!canViewSessionDebrief(session.user.role, session.user.id, booking.session)) {
    return { ok: false, error: "No tienes permiso para registrar el debrief de esta sesión." };
  }

  // RB-RES-010: un debrief marca asistencia, así que primero hay que poder
  // asistir. Sobre una reserva CANCELLED o WAITLISTED esto guardaba el debrief
  // y ponía `status = ATTENDED` sin preguntar: una asistencia inexistente que
  // ocupaba aforo y falseaba adherencia, retención y KPIs.
  const transition = checkBookingTransition(booking.status, "ATTENDED");
  if (!transition.ok) return { ok: false, error: transition.error };

  // Y no se escribe NADA si la reserva ha cambiado entre la lectura y la
  // escritura: la condición de estado viaja dentro del propio UPDATE y el
  // debrief se deshace con la transacción si no se aplica.
  const applied = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: statusesEndingAt("ATTENDED") } },
      data: { status: "ATTENDED", checkedInAt: new Date() },
    });
    if (updated.count === 0) return false;
    await tx.sessionDebrief.upsert({
      where: { bookingId },
      create: { bookingId, feeling },
      update: { feeling },
    });
    return true;
  });
  if (!applied) return { ok: false, error: bookingTransitionMessage(booking.status, "ATTENDED") };

  revalidateSessionViews(sessionId);
  return { ok: true };
}
