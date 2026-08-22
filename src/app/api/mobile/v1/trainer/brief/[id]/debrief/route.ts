import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { canViewSessionDebrief } from "@/lib/rbac";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
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
    select: { session: { select: { trainerId: true, directedByUserId: true } } },
  });
  if (!booking) return apiError("No se ha encontrado esa reserva.", 404);
  if (!canViewSessionDebrief(claims.role, claims.sub, booking.session)) {
    return apiError("No tienes permiso para registrar el debrief de esta sesión.", 403);
  }

  await prisma.sessionDebrief.upsert({
    where: { bookingId },
    create: { bookingId, feeling: feeling as DebriefFeeling },
    update: { feeling: feeling as DebriefFeeling },
  });

  await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "ATTENDED", checkedInAt: new Date() },
  });

  revalidateSessionViews(sessionId);
  return apiOk({ saved: true });
}
