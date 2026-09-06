import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canViewSessionDebrief } from "@/lib/rbac";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { bookingTransitionMessage, checkBookingTransition, statusesEndingAt } from "@/lib/booking-transitions";
import type { DebriefFeeling } from "@prisma/client";
import { requireApiRole } from "../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../_lib/response";

const FEELINGS: DebriefFeeling[] = ["GREEN", "AMBER", "RED"];

// Espejo de src/app/(app)/brief/[id]/actions.ts (setDebrief).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id: sessionId } = await params;

  const body = (await req.json().catch(() => null)) as { bookingId?: string; feeling?: string } | null;
  const bookingId = body?.bookingId;
  const feeling = body?.feeling;
  if (!bookingId || !feeling || !FEELINGS.includes(feeling as DebriefFeeling)) {
    return apiError("Falta la reserva o el estado de la sesión.", 400);
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId: claims.orgId } },
    select: { status: true, session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return apiError("No se ha encontrado esa reserva.", 404);
  if (!canViewSessionDebrief(claims.role, claims.sub, booking.session)) {
    return apiError("No tienes permiso para registrar el debrief de esta sesión.", 403);
  }

  // RB-RES-010, misma costura que la web (`brief/[id]/actions.ts`). Este es el
  // endpoint con el que se verificó el fallo: `POST …/debrief` sobre una
  // reserva cancelada respondía `{"saved":true}` y la dejaba en ATTENDED.
  // 409 y no 400: la petición es correcta, lo que no encaja es el estado.
  const transition = checkBookingTransition(booking.status, "ATTENDED");
  if (!transition.ok) return apiError(transition.error, 409);

  const applied = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: statusesEndingAt("ATTENDED") } },
      data: { status: "ATTENDED", checkedInAt: new Date() },
    });
    if (updated.count === 0) return false;
    await tx.sessionDebrief.upsert({
      where: { bookingId },
      create: { bookingId, feeling: feeling as DebriefFeeling },
      update: { feeling: feeling as DebriefFeeling },
    });
    return true;
  });
  if (!applied) return apiError(bookingTransitionMessage(booking.status, "ATTENDED"), 409);

  revalidateSessionViews(sessionId);
  return apiOk({ saved: true });
}
