import type { NextRequest } from "next/server";
import { saveSession, type SaveSessionInput } from "@/lib/agenda-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { parseDateParam } from "@/lib/date-utils";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

type CreateSessionBody = {
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
};

// Crea una sesión de agenda desde el móvil (espejo de saveSession, sin `id`).
export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageEpSlots(claims.role)) return apiError("No tienes permiso para crear sesiones.", 403);

  const body = (await req.json().catch(() => null)) as CreateSessionBody | null;
  if (!body?.centerId || !body.trainerId || !body.title || !body.type || !body.date || !body.startTime || !body.endTime) {
    return apiError("Faltan campos obligatorios.", 400);
  }

  const input: SaveSessionInput = {
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
  };

  const session = await saveSession(claims.orgId, input);
  revalidateSessionViews(session.id);
  return apiOk({ id: session.id });
}
