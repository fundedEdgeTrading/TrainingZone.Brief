"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import { setSessionDirector, setSessionSelfBookable, getSessionCenterId } from "@/lib/agenda-queries";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";

export type SessionActionResult = { ok: true } | { ok: false; error: string };

/**
 * Ámbito de centro de una sesión concreta. La PÁGINA de la sesión ya lo exigía
 * (`agenda/session/[id]/page.tsx`), pero las acciones no: con el id a mano se
 * podían disparar sin pasar por ella, sobre sesiones de otro centro.
 */
async function requireSessionCenter(orgId: string, sessionId: string, allowed: Parameters<typeof requireCenterRole>[1]) {
  const centerId = await getSessionCenterId(orgId, sessionId);
  if (!centerId) return false;
  await requireCenterRole(centerId, allowed);
  return true;
}

export async function setSessionDirectorAction(sessionId: string, directedByUserId: string): Promise<SessionActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const inScope = await requireSessionCenter(session.user.orgId, sessionId, [
    "CENTER_DIRECTOR",
    "TRAINER",
    "TRAINER_ADMIN",
    "RECEPTION",
  ]);
  if (!inScope) return { ok: false, error: "Sesión no encontrada." };
  const result = await setSessionDirector(session.user.orgId, sessionId, directedByUserId || null);
  if (!result.ok) return result;
  revalidateSessionViews(sessionId);
  return { ok: true };
}

export async function setSessionSelfBookableAction(sessionId: string, selfBookable: boolean): Promise<SessionActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const inScope = await requireSessionCenter(session.user.orgId, sessionId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  if (!inScope) return { ok: false, error: "Sesión no encontrada." };
  const result = await setSessionSelfBookable(session.user.orgId, sessionId, selfBookable);
  if (!result.ok) return result;
  revalidateSessionViews(sessionId);
  return { ok: true };
}

export type CheckInActionResult = { ok: true; checkedIn: boolean } | { ok: false; error: string };

export async function toggleCheckIn(bookingId: string, sessionId: string): Promise<CheckInActionResult> {
  const actor = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const inScope = await requireSessionCenter(actor.user.orgId, sessionId, [
    "CENTER_DIRECTOR",
    "TRAINER",
    "TRAINER_ADMIN",
    "RECEPTION",
  ]);
  if (!inScope) return { ok: false, error: "No se ha encontrado esa reserva." };
  // Acotado a la sesión y a la organización del actor: `findUnique` por id
  // dejaba pasar el check-in de una reserva de cualquier otra organización.
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, sessionId, session: { orgId: actor.user.orgId } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };

  const newStatus = booking.status === "ATTENDED" ? "BOOKED" : "ATTENDED";
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: newStatus,
      checkedInAt: newStatus === "ATTENDED" ? new Date() : null,
    },
  });
  revalidateSessionViews(sessionId);
  return { ok: true, checkedIn: newStatus === "ATTENDED" };
}
