"use server";

import { prisma } from "@/lib/prisma";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import {
  setSessionDirector,
  setSessionSelfBookable,
  getSessionCenterId,
  markBookingNoShow,
  clearBookingNoShow,
} from "@/lib/agenda-queries";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { parseNoShowReason } from "@/lib/no-show";
import { notifyConsecutiveNoShows } from "@/lib/no-show-alerts";

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

  // Rectificar una falta no es solo cambiar el estado: hay que borrar el motivo
  // y, si aquella falta devolvió la sesión al bono, volver a descontarla
  // (RB-RES-009). Por eso pasa por `clearBookingNoShow` y no por un update suelto.
  if (booking.status === "NO_SHOW") {
    const cleared = await clearBookingNoShow(actor.user.orgId, bookingId, newStatus);
    if (!cleared.ok) return cleared;
  } else {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: newStatus,
        checkedInAt: newStatus === "ATTENDED" ? new Date() : null,
      },
    });
  }
  revalidateSessionViews(sessionId);
  return { ok: true, checkedIn: newStatus === "ATTENDED" };
}

export type NoShowActionResult = { ok: true; refunded: boolean } | { ok: false; error: string };

/**
 * RB-RES-009: marcar "No asistió" con motivo y con la decisión sobre el bono.
 * La devolución ya no es automática ni imposible: la elige el entrenador en el
 * momento, reserva a reserva.
 */
export async function markNoShowAction(
  bookingId: string,
  sessionId: string,
  reasonRaw: string,
  refundSession: boolean
): Promise<NoShowActionResult> {
  const actor = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  const inScope = await requireSessionCenter(actor.user.orgId, sessionId, [
    "CENTER_DIRECTOR",
    "TRAINER",
    "TRAINER_ADMIN",
    "RECEPTION",
  ]);
  if (!inScope) return { ok: false, error: "No se ha encontrado esa reserva." };

  // El motivo llega del cliente: se valida contra el enum en vez de confiar en
  // el desplegable, que es solo la versión amable de la misma lista.
  const reason = parseNoShowReason(reasonRaw);
  if (!reason) return { ok: false, error: "Indica el motivo de la falta." };

  const result = await markBookingNoShow(actor.user.orgId, bookingId, { sessionId, reason, refundSession });
  if (!result.ok) return result;

  // Tres faltas seguidas sin avisar son un aviso a dirección, no un incidente
  // de agenda. No puede tumbar el marcado si falla: el estado de la reserva ya
  // está escrito y es lo que el entrenador está esperando.
  try {
    await notifyConsecutiveNoShows(actor.user.orgId, result.memberId);
  } catch (error) {
    console.error("[no-show] no se pudo revisar la racha de faltas:", error);
  }

  revalidateSessionViews(sessionId);
  return { ok: true, refunded: result.refunded };
}
