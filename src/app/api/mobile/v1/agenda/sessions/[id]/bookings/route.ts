import type { NextRequest } from "next/server";
import {
  bookSessionForMemberAsStaff,
  getSessionCenterId,
  getSessionDetail,
  listMembersBookableForSession,
} from "@/lib/agenda-queries";
import { isCenterInScope } from "@/lib/center-scope";
import { parseDateParam, formatDateParam } from "@/lib/date-utils";
import { revalidateSessionViews } from "@/lib/revalidate-sessions";
import { requireApiRole } from "../../../../_lib/api-session";
import { apiOk, apiError } from "../../../../_lib/response";

// Mismo staff que gestiona la agenda desde el móvil (ver ../../route.ts):
// crear/editar sesiones exige `canManageEpSlots`, pero reservar o cancelar
// una plaza puntual también lo hace recepción, igual que en la web
// (session-actions.ts: bookSessionForMemberAction/cancelSessionBookingAction).
const STAFF_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"] as const;

/** El centro de la sesión tiene que estar entre los que este staff tiene imputados. */
async function assertSessionInScope(
  orgId: string,
  claims: { sub: string; role: import("@prisma/client").Role; centerId: string | null },
  sessionId: string
) {
  const centerId = await getSessionCenterId(orgId, sessionId);
  if (!centerId) return null;
  const inScope = await isCenterInScope({ id: claims.sub, role: claims.role, orgId, centerId: claims.centerId }, centerId);
  if (!inScope) return null;
  return centerId;
}

// GET: roster (+ lista de espera) de la ocurrencia y a quién se le puede dar
// una plaza. Espejo móvil de agenda/session-actions.ts:getSessionAttendeesAction.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, [...STAFF_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const centerId = await assertSessionInScope(claims.orgId, claims, id);
  if (!centerId) return apiError("Sesión no encontrada.", 404);

  const dateParam = req.nextUrl.searchParams.get("date");
  const cls = await getSessionDetail(claims.orgId, id, dateParam);
  if (!cls) return apiError("Sesión no encontrada.", 404);

  const attendees = cls.bookings
    .filter((b) => b.status !== "CANCELLED")
    .map((b) => ({
      bookingId: b.id,
      memberId: b.member.id,
      name: `${b.member.firstName} ${b.member.lastName}`,
      status: b.status,
    }));
  const bookedMemberIds = new Set(attendees.filter((a) => a.status !== "WAITLISTED").map((a) => a.memberId));
  const waitingMemberIds = new Set(attendees.filter((a) => a.status === "WAITLISTED").map((a) => a.memberId));
  const bookableMembers = (await listMembersBookableForSession(claims.orgId, id))
    .filter((m) => !bookedMemberIds.has(m.id))
    .map((m) => ({ ...m, waiting: waitingMemberIds.has(m.id) }));

  return apiOk({
    occurrenceDate: formatDateParam(cls.occurrenceDate),
    capacity: cls.capacity,
    attendees,
    bookableMembers,
  });
}

type AddBookingBody = { memberId?: string; occurrenceDate?: string };

// POST: da de alta a un socio en la ocurrencia (RB-AGENDA-003), descontando su
// bono con la misma transacción atómica que usa el portal al reservar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(req, [...STAFF_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  const { id } = await params;

  const centerId = await assertSessionInScope(claims.orgId, claims, id);
  if (!centerId) return apiError("Sesión no encontrada.", 404);

  const body = (await req.json().catch(() => null)) as AddBookingBody | null;
  if (!body?.memberId || !body.occurrenceDate) return apiError("Faltan campos obligatorios.", 400);

  const result = await bookSessionForMemberAsStaff(claims.orgId, {
    sessionId: id,
    memberId: body.memberId,
    occurrenceDate: parseDateParam(body.occurrenceDate),
  });
  if (!result.ok) return apiError(result.error, 400);

  revalidateSessionViews(id);
  return apiOk({ claimedFromWaitlist: result.claimedFromWaitlist });
}
