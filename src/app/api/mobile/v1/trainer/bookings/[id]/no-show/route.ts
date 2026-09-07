import type { NextRequest, NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { markBookingNoShow, clearBookingNoShow, getBookingCenterId } from "@/lib/agenda-queries";
import { isCenterInScope } from "@/lib/center-scope";
import { parseNoShowReason, NO_SHOW_REASONS, NO_SHOW_REASON_HELP } from "@/lib/no-show";
import { notifyConsecutiveNoShows } from "@/lib/no-show-alerts";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../_lib/response";

/**
 * E2-14 (decisión D-M1) · RB-RES-009: el no-show desde la app.
 *
 * Hasta ahora `markBookingNoShow`/`clearBookingNoShow` tenían un único
 * consumidor, la web. Un entrenador que trabaje solo desde la app (1) marcaba
 * asistencia implícitamente al guardar el debrief, (2) dejaba en BOOKED para
 * siempre a quien no apareció, (3) nunca disparaba la alerta de tres faltas y
 * (4) falseaba `getNoShowRate`.
 *
 * Es el ESPEJO exacto de `markNoShowAction` (agenda/session/[id]/actions.ts),
 * no una regla paralela: mismas funciones de dominio, mismo enum de motivos
 * validado en servidor, misma decisión explícita sobre el bono y la misma
 * revisión de la racha. El patrón "espejo móvil" es justamente el que se
 * rompe cuando cada superficie escribe su propia versión de la regla.
 *
 * `GET` devuelve los motivos con su texto largo para que el desplegable de la
 * app no lleve la lista copiada: si un día cambia el enum, cambia sola.
 */
const STAFF_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"];

type Guarded = { ok: true; orgId: string; actorUserId: string } | { ok: false; response: NextResponse };

/**
 * Ámbito de centro: el centro sale de la SESIÓN de la reserva, nunca de nada
 * que mande el cliente. Fuera de ámbito se responde 404 y no 403 — para quien
 * pide, esa reserva no existe.
 */
async function guard(req: NextRequest, bookingId: string): Promise<Guarded> {
  const auth = await requireApiRole(req, STAFF_ROLES);
  if (!auth.ok) return { ok: false, response: auth.response };
  const { claims } = auth;

  const centerId = await getBookingCenterId(claims.orgId, bookingId);
  if (!centerId) return { ok: false, response: apiError("No se ha encontrado esa reserva.", 404) };

  const inScope = await isCenterInScope(
    { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId },
    centerId
  );
  if (!inScope) return { ok: false, response: apiError("No se ha encontrado esa reserva.", 404) };

  return { ok: true, orgId: claims.orgId, actorUserId: claims.sub };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if (!g.ok) return g.response;

  return apiOk({
    reasons: NO_SHOW_REASONS.map((value) => ({ value, help: NO_SHOW_REASON_HELP[value] })),
  });
}

type Body = { reason?: string | null; refundSession?: boolean };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if (!g.ok) return g.response;

  const body = (await req.json().catch(() => null)) as Body | null;

  // El motivo es OBLIGATORIO y se valida contra el enum, igual que en la web:
  // el desplegable es solo la versión amable de la misma lista, y el cliente
  // puede mandar lo que quiera.
  const reason = parseNoShowReason(body?.reason);
  if (!reason) return apiError("Indica el motivo de la falta.", 400);

  // La devolución es una decisión explícita, no un valor por defecto que el
  // entrenador descubra después. Sin ella, no se devuelve.
  const refundSession = body?.refundSession === true;

  const result = await markBookingNoShow(g.orgId, id, { reason, refundSession, actorUserId: g.actorUserId });
  // Estado de partida (E2-02): CANCELLED o WAITLISTED se rechazan con 409, que
  // es un conflicto de estado y no un "no existe".
  if (!result.ok) return apiError(result.error, result.conflict ? 409 : 404);

  // Tres faltas seguidas sin avisar son un aviso a dirección, no un incidente
  // de agenda: no puede tumbar el marcado si falla, porque el estado ya está
  // escrito y es lo que el entrenador está esperando.
  try {
    await notifyConsecutiveNoShows(g.orgId, result.memberId);
  } catch (error) {
    console.error("[no-show] no se pudo revisar la racha de faltas:", error);
  }

  revalidateSessionViews(result.sessionId);
  // `noShowRefunded` es el cierre de la devolución (ver `markBookingNoShow`):
  // marcar dos veces la misma falta no devuelve la sesión dos veces, y aquí se
  // devuelve el estado real de esa bandera, no lo que se pidió.
  return apiOk({ status: "NO_SHOW", reason, refunded: result.refunded });
}

/**
 * Rectificar: la falta se deshace y, si había devuelto la sesión, se vuelve a
 * descontar sin dejar el bono en negativo (`clearBookingNoShow`).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(req, id);
  if (!g.ok) return g.response;

  // A dónde vuelve la reserva. Por defecto BOOKED: deshacer una falta no es
  // afirmar que la persona vino.
  const asAttended = req.nextUrl.searchParams.get("status") === "ATTENDED";
  const nextStatus = asAttended ? ("ATTENDED" as const) : ("BOOKED" as const);

  const result = await clearBookingNoShow(g.orgId, id, nextStatus, g.actorUserId);
  if (!result.ok) return apiError(result.error, result.conflict ? 409 : 404);

  revalidateSessionViews(result.sessionId);
  return apiOk({ status: nextStatus });
}
