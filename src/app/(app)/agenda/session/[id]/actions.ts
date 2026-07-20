"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { requireRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import { setSessionDirector, setSessionSelfBookable } from "@/lib/agenda-queries";

export type SessionActionResult = { ok: true } | { ok: false; error: string };

export async function setSessionDirectorAction(sessionId: string, directedByUserId: string): Promise<SessionActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  const result = await setSessionDirector(session.user.orgId, sessionId, directedByUserId || null);
  if (!result.ok) return result;
  revalidatePath(`/agenda/session/${sessionId}`);
  return { ok: true };
}

export async function setSessionSelfBookableAction(sessionId: string, selfBookable: boolean): Promise<SessionActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso." };
  const result = await setSessionSelfBookable(session.user.orgId, sessionId, selfBookable);
  if (!result.ok) return result;
  revalidatePath(`/agenda/session/${sessionId}`);
  return { ok: true };
}

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
