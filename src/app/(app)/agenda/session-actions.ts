"use server";

import { requireRole, requireCenterRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import { saveSession, deleteSession, rescheduleSession, cancelSessionBooking } from "@/lib/agenda-queries";
import { parseDateParam } from "@/lib/date-utils";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";

export type SessionActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER"] as const;

/** "HH:MM" en reloj de 24 h; nada más entra en `ClassSession.startTime`/`endTime`. */
function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

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
  const capacityRaw = Number(formData.get("capacity"));
  const capacity = Number.isFinite(capacityRaw) && capacityRaw > 0 ? capacityRaw : null;
  // RB-AGENDA-002: sin este flag la franja de EP nace cerrada y el socio nunca
  // llega a verla en el portal — el diálogo lo manda siempre marcado por defecto.
  const selfBookable = formData.get("selfBookable") === "on";
  const isTrial = formData.get("isTrial") === "on";
  const recurrenceRaw = String(formData.get("recurrence") ?? "NONE");
  const recurrence = recurrenceRaw === "WEEKLY" || recurrenceRaw === "WEEKDAYS" ? recurrenceRaw : "NONE";
  const recUntilRaw = String(formData.get("recUntil") ?? "");
  let title = String(formData.get("title") ?? "").trim();

  if (!centerId || !trainerId || !dateRaw || !startTime) return { ok: false, error: "Completa entrenador, fecha y hora." };
  // Sin validar el formato, un "HH:MM" corrupto se propagaba como "NaN:NaN"
  // hasta la base de datos en vez de rechazarse aquí.
  if (!isValidHHMM(startTime)) return { ok: false, error: "La hora de inicio no es válida." };
  if (endTime && !isValidHHMM(endTime)) return { ok: false, error: "La hora de fin no es válida." };

  if (!endTime || endTime <= startTime) {
    // La duración por defecto no puede desbordar el día: con `% 24`, una sesión
    // que empezara a las 23:45 acababa a las "00:15", una hora ANTERIOR a la de
    // inicio, y toda la aritmética de duración y solapes la leía en negativo.
    const [h, m] = startTime.split(":").map(Number);
    const total = Math.min(h * 60 + m + 30, 23 * 60 + 59);
    endTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  if (!title) title = type === "reduced" ? "Grupo reducido" : "Sesión";
  if (isTrial && !title.startsWith("Prueba · ")) title = `Prueba · ${title}`;

  const result = await saveSession(session.user.orgId, {
    id,
    centerId,
    trainerId,
    title,
    type,
    date: parseDateParam(dateRaw),
    startTime,
    endTime,
    memberId,
    capacity,
    selfBookable,
    isTrial,
    recurrence,
    recUntil: recurrence !== "NONE" && recUntilRaw ? parseDateParam(recUntilRaw) : null,
  });
  if (!result.ok) return result;

  revalidateSessionViews();
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

  revalidateSessionViews();
  return { ok: true };
}

/**
 * Cancela una reserva concreta desde el roster de la sesión. Antes esto se
 * hacía implícitamente al guardar la sesión (vaciando el campo "Socio"), lo que
 * arrastraba consigo las reservas del resto de socios; ahora es explícito y
 * devuelve el bono, igual que si cancelara el propio socio.
 */
export async function cancelSessionBookingAction(bookingId: string, sessionId: string): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES, "RECEPTION"]);
  const result = await cancelSessionBooking(session.user.orgId, bookingId);
  if (!result.ok) return result;

  revalidateSessionViews(sessionId);
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

  const result = await rescheduleSession(session.user.orgId, input.id, parseDateParam(input.date), input.startTime, input.endTime);
  if (!result.ok) return result;

  revalidateSessionViews();
  return { ok: true };
}
