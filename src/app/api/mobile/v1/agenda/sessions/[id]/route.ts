import type { NextRequest } from "next/server";
import { saveSession, deleteSession, type SaveSessionInput } from "@/lib/agenda-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { parseDateParam } from "@/lib/date-utils";
import { parseEditScope } from "@/lib/session-series";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../../_lib/api-session";
import { apiOk, apiError } from "../../../_lib/response";

type UpdateSessionBody = {
  centerId?: string;
  trainerId?: string;
  title?: string;
  type?: "personal" | "reduced";
  date?: string;
  startTime?: string;
  endTime?: string;
  memberId?: string | null;
  capacity?: number | null;
  /** RB-AGENDA-002: franja de EP abierta a que el socio la reserve desde el portal. */
  selfBookable?: boolean;
  isTrial?: boolean;
  recurrence?: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil?: string | null;
  /**
   * Alcance de la edición si la sesión se repite (ver `session-series.ts`) y
   * día de la serie al que se refiere. Sin ellos se edita la serie entera,
   * incluidas las ocurrencias ya pasadas.
   */
  scope?: "all" | "future" | "single";
  occurrenceDate?: string | null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageEpSlots(claims.role)) return apiError("No tienes permiso para editar sesiones.", 403);
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as UpdateSessionBody | null;
  if (!body?.centerId || !body.trainerId || !body.title || !body.type || !body.date || !body.startTime || !body.endTime) {
    return apiError("Faltan campos obligatorios.", 400);
  }

  const input: SaveSessionInput = {
    id,
    centerId: body.centerId,
    trainerId: body.trainerId,
    title: body.title,
    type: body.type,
    date: parseDateParam(body.date),
    startTime: body.startTime,
    endTime: body.endTime,
    memberId: body.memberId ?? null,
    capacity: body.capacity ?? null,
    // Por defecto, una franja de EP nueva es autorreservable: si no, el socio
    // no la ve en el portal y la sesión que acaba de crear el entrenador queda
    // muerta (RB-AGENDA-001/002).
    selfBookable: body.selfBookable ?? true,
    isTrial: Boolean(body.isTrial),
    recurrence: body.recurrence ?? "NONE",
    recUntil: body.recUntil ? parseDateParam(body.recUntil) : null,
    scope: parseEditScope(body.scope),
    occurrenceDate: body.occurrenceDate ? parseDateParam(body.occurrenceDate) : null,
  };

  const result = await saveSession(claims.orgId, input);
  if (!result.ok) return apiError(result.error, 404);
  revalidateSessionViews(result.session.id);
  return apiOk({ id: result.session.id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageEpSlots(claims.role)) return apiError("No tienes permiso para borrar sesiones.", 403);
  const { id } = await params;

  const result = await deleteSession(claims.orgId, id);
  if (!result.ok) return apiError(result.error, 404);
  revalidateSessionViews(id);
  return apiOk({ deleted: true });
}
