import type { NextRequest } from "next/server";
import { saveSession, deleteSession, getSessionCenterId, type SaveSessionInput } from "@/lib/agenda-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { parseDateParam } from "@/lib/date-utils";
import { checkSessionSchedule } from "@/lib/session-time";
import { parseEditScope } from "@/lib/session-series";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../../_lib/api-session";
import { requireApiCenterScope } from "../../../_lib/api-guards";
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
  // E2-12: la tercera vía de escritura de agenda, con el mismo validador.
  const schedule = checkSessionSchedule(body);
  if (!schedule.ok) return apiError(schedule.error, 400);

  // E1-02 (RB-SEG-002): al editar hay DOS centros que comprobar, igual que en
  // `saveSessionAction` (web).
  //
  //  - El de DESTINO, que llega en el cuerpo. Sin él, mover una sesión propia a
  //    un centro ajeno sería una escritura en ese centro.
  //  - El de ORIGEN, que sale de la propia sesión. Sin él bastaba con mandar el
  //    centro propio junto al id de una sesión ajena para reescribirla entera
  //    —y traérsela de paso—: así se renombró una a "AUDIT-HIJACKED" con un 200.
  const destination = await requireApiCenterScope(claims, body.centerId);
  if (!destination.ok) return apiError("No se ha encontrado esa sesión.", 404);

  const currentCenterId = await getSessionCenterId(claims.orgId, id);
  if (!currentCenterId) return apiError("No se ha encontrado esa sesión.", 404);
  const origin = await requireApiCenterScope(claims, currentCenterId);
  if (!origin.ok) return apiError("No se ha encontrado esa sesión.", 404);

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

  // E1-02: el centro sale de la sesión, no del cliente — es lo único que no se
  // puede falsear. Por E2-01, borrar una sesión ajena además quema los bonos de
  // todos los apuntados.
  const centerId = await getSessionCenterId(claims.orgId, id);
  if (!centerId) return apiError("No se ha encontrado esa sesión.", 404);
  const scope = await requireApiCenterScope(claims, centerId);
  if (!scope.ok) return apiError("No se ha encontrado esa sesión.", 404);

  // RB-AGENDA-010 (E2-01): mismo criterio que la web. Con asistencias ya
  // registradas el borrado no se ejecuta a la primera: 409 con el texto a
  // confirmar, y la app repite con `?confirmSettled=1`. 409 y no 404 porque la
  // sesión existe y está en ámbito: lo que falta es la decisión de quien borra.
  const confirmSettled = req.nextUrl.searchParams.get("confirmSettled") === "1";
  const result = await deleteSession(claims.orgId, id, { actorUserId: claims.sub, confirmSettled });
  if (!result.ok) {
    return result.needsConfirmation ? apiError(result.error, 409) : apiError(result.error, 404);
  }
  revalidateSessionViews(id);
  return apiOk({ deleted: true, refunded: result.refunded });
}
