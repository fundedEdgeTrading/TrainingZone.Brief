"use server";

import { requireRole, requireCenterRole } from "@/lib/guard";
import { canManageEpSlots } from "@/lib/rbac";
import {
  saveSession,
  deleteSession,
  rescheduleSession,
  bookSessionForMemberAsStaff,
  cancelSessionBooking,
  getSessionCenterId,
  getBookingCenterId,
  getSessionDetail,
  listMembersBookableForSession,
} from "@/lib/agenda-queries";
import { parseDateParam } from "@/lib/date-utils";
import { parseEditScope } from "@/lib/session-series";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";

export type SessionActionResult = { ok: true } | { ok: false; error: string };

const ALLOWED_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"] as const;

/** "HH:MM" en reloj de 24 h; nada más entra en `ClassSession.startTime`/`endTime`. */
function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function saveSessionAction(formData: FormData): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso para gestionar la agenda." };

  const centerId = String(formData.get("centerId") ?? "");
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);

  const id = String(formData.get("id") ?? "") || null;
  // Al editar hay DOS centros que comprobar: el de destino (el del formulario,
  // ya validado arriba) y el de origen. Sin este segundo control, mandar el
  // centro propio con el id de una sesión de otro centro la reescribía entera
  // —y de paso se la traía al centro del atacante—.
  if (id) {
    const currentCenterId = await getSessionCenterId(session.user.orgId, id);
    if (!currentCenterId) return { ok: false, error: "Sesión no encontrada." };
    await requireCenterRole(currentCenterId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  }
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
  // Alcance de la edición de una serie recurrente y día concreto al que se
  // refiere: sin ellos, guardar cualquier cambio reescribía también el pasado.
  const scope = parseEditScope(formData.get("scope"));
  const occurrenceRaw = String(formData.get("occurrenceDate") ?? "");
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
    // Tan tarde que ni siquiera cabe un minuto antes de medianoche: la sesión
    // tendría duración cero, así que se pide una hora de inicio razonable.
    if (endTime <= startTime) return { ok: false, error: "La hora de inicio es demasiado tardía: la sesión no cabe en el día." };
  }

  // Sin título, el que pone el tipo elegido (el mismo prefijo que escribe el
  // diálogo al seleccionarlo: "EP …" / "Grupo …").
  if (!title) title = type === "reduced" ? "Grupo reducido" : "EP";
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
    scope,
    occurrenceDate: occurrenceRaw ? parseDateParam(occurrenceRaw) : null,
  });
  if (!result.ok) return result;

  revalidateSessionViews();
  return { ok: true };
}

export async function deleteSessionAction(formData: FormData): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES]);
  if (!canManageEpSlots(session.user.role)) return { ok: false, error: "No tienes permiso para gestionar la agenda." };

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Sesión no encontrada." };

  // El centro sale de la sesión, no del formulario: es lo único que el cliente
  // no puede falsear para borrar la sesión de otro centro.
  const centerId = await getSessionCenterId(session.user.orgId, id);
  if (!centerId) return { ok: false, error: "Sesión no encontrada." };
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);

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

  // Ámbito de centro: cancelar la reserva de un socio es tocar el roster de esa
  // sesión, y el roster es del centro que la imparte.
  const centerId = await getBookingCenterId(session.user.orgId, bookingId);
  if (!centerId) return { ok: false, error: "No se ha encontrado esa reserva." };
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);

  const result = await cancelSessionBooking(session.user.orgId, bookingId);
  if (!result.ok) return result;

  revalidateSessionViews(sessionId);
  return { ok: true };
}

/**
 * Reserva la plaza de un socio concreto en una sesión, desde el roster. Es el
 * reverso de `cancelSessionBookingAction` y la vía por la que recepción apunta
 * a quien no usa la app (o reclama, en su nombre, una plaza que se ha
 * liberado). Puntual y por día: no crea "clientes fijos" de grupo reducido.
 */
export async function bookSessionForMemberAction(
  sessionId: string,
  memberId: string,
  occurrenceDate: string
): Promise<SessionActionResult> {
  const session = await requireRole([...ALLOWED_ROLES, "RECEPTION"]);
  if (!memberId) return { ok: false, error: "Elige un socio." };

  // El centro sale de la sesión, nunca del formulario: es lo único que el
  // cliente no puede falsear para tocar el roster de otro centro.
  const centerId = await getSessionCenterId(session.user.orgId, sessionId);
  if (!centerId) return { ok: false, error: "Sesión no encontrada." };
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);

  const result = await bookSessionForMemberAsStaff(session.user.orgId, {
    sessionId,
    memberId,
    occurrenceDate: parseDateParam(occurrenceDate),
  });
  if (!result.ok) return result;

  revalidateSessionViews(sessionId);
  return { ok: true };
}

export type SessionAttendee = {
  bookingId: string;
  memberId: string;
  name: string;
  status: "BOOKED" | "WAITLISTED" | "ATTENDED" | "NO_SHOW";
};

export type SessionAttendeesResult =
  | {
      ok: true;
      capacity: number;
      attendees: SessionAttendee[];
      bookableMembers: { id: string; firstName: string; lastName: string; waiting: boolean }[];
    }
  | { ok: false; error: string };

/**
 * Datos del apartado "Asistentes" del diálogo de sesión: roster + lista de
 * espera de la ocurrencia que se está editando, y a quién se le puede dar una
 * plaza (mismo cálculo que la página de detalle, `session/[id]`). Se pide
 * aparte porque el diálogo abre con solo el recuento (`bookedCount`), no con
 * el roster completo.
 */
export async function getSessionAttendeesAction(sessionId: string, occurrenceDate: string): Promise<SessionAttendeesResult> {
  const session = await requireRole([...ALLOWED_ROLES, "RECEPTION"]);

  const centerId = await getSessionCenterId(session.user.orgId, sessionId);
  if (!centerId) return { ok: false, error: "Sesión no encontrada." };
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);

  const cls = await getSessionDetail(session.user.orgId, sessionId, occurrenceDate);
  if (!cls) return { ok: false, error: "Sesión no encontrada." };

  const attendees = cls.bookings
    .filter((b) => b.status !== "CANCELLED")
    .map((b) => ({
      bookingId: b.id,
      memberId: b.member.id,
      name: `${b.member.firstName} ${b.member.lastName}`,
      status: b.status as SessionAttendee["status"],
    }));

  const bookedMemberIds = new Set(attendees.filter((a) => a.status !== "WAITLISTED").map((a) => a.memberId));
  const waitingMemberIds = new Set(attendees.filter((a) => a.status === "WAITLISTED").map((a) => a.memberId));
  const bookableMembers = (await listMembersBookableForSession(session.user.orgId, sessionId))
    .filter((m) => !bookedMemberIds.has(m.id))
    .map((m) => ({ ...m, waiting: waitingMemberIds.has(m.id) }));

  return { ok: true, capacity: cls.capacity, attendees, bookableMembers };
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

  // Igual que al borrar: manda el centro real de la sesión, no el que venga en
  // la petición (que el cliente elige).
  const centerId = await getSessionCenterId(session.user.orgId, input.id);
  if (!centerId) return { ok: false, error: "Sesión no encontrada." };
  await requireCenterRole(centerId, ["CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);

  const result = await rescheduleSession(session.user.orgId, input.id, parseDateParam(input.date), input.startTime, input.endTime);
  if (!result.ok) return result;

  revalidateSessionViews();
  return { ok: true };
}
