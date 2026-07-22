"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireCenterRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import { saveSession, deleteSession, rescheduleSession } from "@/lib/agenda-queries";

export type SessionActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER"] as const;

export async function saveSessionAction(formData: FormData): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso para gestionar la agenda." };

  const centerId = String(formData.get("centerId") ?? "");
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER"]);

  const id = String(formData.get("id") ?? "") || null;
  const type = String(formData.get("type") ?? "personal") === "reduced" ? "reduced" : "personal";
  const trainerId = String(formData.get("trainerId") ?? "") || session.user.id;
  const dateRaw = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  let endTime = String(formData.get("endTime") ?? "");
  const memberId = String(formData.get("memberId") ?? "") || null;
  const isTrial = formData.get("isTrial") === "on";
  const recurrenceRaw = String(formData.get("recurrence") ?? "NONE");
  const recurrence = recurrenceRaw === "WEEKLY" || recurrenceRaw === "WEEKDAYS" ? recurrenceRaw : "NONE";
  const recUntilRaw = String(formData.get("recUntil") ?? "");
  let title = String(formData.get("title") ?? "").trim();

  if (!centerId || !trainerId || !dateRaw || !startTime) return { ok: false, error: "Completa entrenador, fecha y hora." };

  if (!endTime || endTime <= startTime) {
    const [h, m] = startTime.split(":").map(Number);
    const total = h * 60 + m + 30;
    endTime = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  if (!title) title = type === "reduced" ? "Grupo reducido" : "Sesión";
  if (isTrial && !title.startsWith("Prueba · ")) title = `Prueba · ${title}`;

  await saveSession(session.user.orgId, {
    id,
    centerId,
    trainerId,
    title,
    type,
    date: new Date(dateRaw),
    startTime,
    endTime,
    memberId,
    isTrial,
    recurrence,
    recUntil: recurrence !== "NONE" && recUntilRaw ? new Date(recUntilRaw) : null,
  });

  revalidatePath("/agenda");
  return { ok: true };
}

export async function deleteSessionAction(formData: FormData): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso para gestionar la agenda." };

  const centerId = String(formData.get("centerId") ?? "");
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER"]);

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Sesión no encontrada." };

  const result = await deleteSession(session.user.orgId, id);
  if (!result.ok) return result;

  revalidatePath("/agenda");
  return { ok: true };
}

export async function moveSessionAction(input: {
  id: string;
  centerId: string;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso para gestionar la agenda." };

  await requireCenterRole(input.centerId, ["CENTER_DIRECTOR", "TRAINER"]);

  const result = await rescheduleSession(session.user.orgId, input.id, new Date(input.date), input.startTime, input.endTime);
  if (!result.ok) return result;

  revalidatePath("/agenda");
  return { ok: true };
}
