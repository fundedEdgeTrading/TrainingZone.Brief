import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { createEpSlot } from "@/lib/agenda-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { isCenterInScope } from "@/lib/center-scope";
import { parseDateParam } from "@/lib/date-utils";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk, apiError } from "../../_lib/response";

/**
 * «Publicar hueco de EP» (RB-AGENDA-006). Una franja personal sin cliente
 * asignado que el socio se reserva desde su app.
 *
 * Detalle que el copy de la app repite y conviene no perder: ese hueco nace
 * SIN bono asociado (`createEpSlot` crea la reserva con `subscriptionId` null
 * cuando se agenda a mano), así que agendarlo el entrenador no descuenta
 * sesión. Cuando lo reserva el socio por su cuenta, sí pasa por el motor de
 * reservas y consume normalmente.
 */
const EP_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"];

const MIN_DURATION = 15;
const MAX_DURATION = 240;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Body = {
  centerId?: string;
  trainerId?: string;
  date?: string;
  startTime?: string;
  durationMin?: number;
  /** Vacío = hueco libre, que es el caso del rediseño. */
  memberId?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireApiRole(req, EP_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageEpSlots(claims.role)) return apiError("No tienes permiso para publicar huecos de EP.", 403);

  const body = (await req.json().catch(() => null)) as Body | null;
  const centerId = body?.centerId?.trim() || claims.centerId;
  if (!centerId) return apiError("Indica el centro del hueco.", 400);
  if (!body?.date || !body.startTime) return apiError("Faltan la fecha y la hora de inicio.", 400);
  if (!TIME_RE.test(body.startTime)) return apiError("La hora de inicio no es válida.", 400);

  const durationMin = Math.round(Number(body.durationMin ?? 60));
  if (!Number.isFinite(durationMin) || durationMin < MIN_DURATION || durationMin > MAX_DURATION) {
    return apiError(`La duración va de ${MIN_DURATION} a ${MAX_DURATION} minutos.`, 400);
  }

  if (!(await isCenterInScope({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId }, centerId))) {
    return apiError("No se ha encontrado ese centro.", 404);
  }

  // Un entrenador publica SUS huecos: el `trainerId` que llegue solo se respeta
  // si quien pide es dirección, que sí agenda por terceros.
  const isDirection = claims.role === "OWNER" || claims.role === "CENTER_DIRECTOR";
  const trainerId = isDirection && body.trainerId ? body.trainerId : claims.sub;

  const session = await createEpSlot(claims.orgId, {
    centerId,
    trainerId,
    date: parseDateParam(body.date),
    startTime: body.startTime,
    durationMin,
    // Sin cliente, el hueco queda autorreservable desde la app del socio; con
    // cliente asignado es una sesión cerrada y no se ofrece a nadie más.
    selfBookable: !body.memberId,
    memberId: body.memberId ?? null,
  });

  revalidateSessionViews(session.id);
  return apiOk({ id: session.id, selfBookable: !body.memberId });
}
