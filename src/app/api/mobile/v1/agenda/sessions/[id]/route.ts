import type { NextRequest } from "next/server";
import { saveSession, deleteSession, type SaveSessionInput } from "@/lib/agenda-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { parseDateParam } from "@/lib/date-utils";
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
  isTrial?: boolean;
  recurrence?: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil?: string | null;
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
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
    isTrial: Boolean(body.isTrial),
    recurrence: body.recurrence ?? "NONE",
    recUntil: body.recUntil ? parseDateParam(body.recUntil) : null,
  };

  const session = await saveSession(claims.orgId, input);
  revalidateSessionViews(session.id);
  return apiOk({ id: session.id });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageEpSlots(claims.role)) return apiError("No tienes permiso para borrar sesiones.", 403);
  const { id } = await params;

  const result = await deleteSession(claims.orgId, id);
  if (!result.ok) return apiError(result.error, 404);
  revalidateSessionViews(id);
  return apiOk({ deleted: true });
}
