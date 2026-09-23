import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCentersForUser, listMembersBookableInCenter } from "@/lib/agenda-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { formatDateParam, parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { expandOccurrences, isSameDay, sessionsInRangeWhere } from "@/lib/session-occurrences";
import { requireApiRole } from "../_lib/api-session";
import { requireApiCenterScope } from "../_lib/api-guards";
import { apiOk } from "../_lib/response";

const STAFF_AGENDA_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"] as const;

// Agenda operativa (día) para entrenador/dirección: espejo simplificado de
// src/app/(app)/agenda/page.tsx, pensado para crear/editar sesiones desde el móvil.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, [...STAFF_AGENDA_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const centers = await getCentersForUser({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
  // Mismo criterio que la web (src/app/(app)/agenda/page.tsx): el `centerId`
  // del cliente solo puede elegir entre los centros imputados a esta persona,
  // nunca abrir uno ajeno.
  const allowed = new Set(centers.map((c) => c.id));
  const centerParam = req.nextUrl.searchParams.get("centerId");
  const requested = centerParam && allowed.has(centerParam) ? centerParam : null;
  const base = claims.centerId && allowed.has(claims.centerId) ? claims.centerId : null;
  const centerId = requested ?? base ?? centers[0]?.id ?? null;
  // Invariante del trimestre: toda lectura con `centerId` pasa por la guarda de
  // centro, también en la API móvil. Hoy `centerId` sale ya de los centros
  // imputados, así que no debería cortar nunca; está para que un cambio en la
  // elección de arriba no convierta este endpoint en otra vía sin ámbito.
  if (centerId) {
    const scope = await requireApiCenterScope(claims, centerId);
    if (!scope.ok) return scope.response;
  }

  const dateParam = req.nextUrl.searchParams.get("date");
  const day = dateParam ? parseDateParam(dateParam) : zonedNow(await resolveTimezoneForCenter(centerId));
  day.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const canEdit = Boolean(centerId) && canManageEpSlots(claims.role);

  const [rows, trainers, members] = centerId
    ? await Promise.all([
        prisma.classSession.findMany({
          where: { orgId: claims.orgId, centerId, ...sessionsInRangeWhere(day, dayEnd) },
          include: {
            trainer: { select: { id: true, name: true, image: true } },
            bookings: {
              where: { status: { not: "CANCELLED" } },
              select: { id: true, status: true, occurrenceDate: true, member: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
          orderBy: { startTime: "asc" },
        }),
        listAssignableStaff(claims.orgId, ["TRAINER", "TRAINER_ADMIN"], centerId),
        // QA-RES-07: el selector de cliente de la franja de EP, con el mismo
        // criterio que la web — socios con bono de EP activo EN ESTE centro.
        // `listActiveMembersForSelect(orgId)` devolvía los de toda la
        // organización: un entrenador de A veía y podía elegir socios de B.
        listMembersBookableInCenter(claims.orgId, centerId, "EP"),
      ])
    : [[], [], []];

  const sessions = expandOccurrences(rows, day, dayEnd).map(({ session: s, date }) => ({
    id: s.id,
    name: s.name,
    classType: s.classType,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    room: s.room,
    isTrial: s.isTrial,
    recurrence: s.recurrence,
    selfBookable: s.selfBookable,
    trainerId: s.trainerId,
    trainerName: s.trainer?.name ?? null,
    trainerImage: s.trainer?.image ?? null,
    // Roster del día pedido: una serie recurrente comparte fila entre ocurrencias.
    bookings: s.bookings
      .filter((b) => isSameDay(b.occurrenceDate, date))
      .map((b) => ({ id: b.id, status: b.status, member: b.member })),
  }));

  return apiOk({
    date: formatDateParam(day),
    centers: centers.map((c) => ({ id: c.id, name: c.name })),
    centerId,
    canEdit,
    trainers: trainers.map((t) => ({ id: t.id, name: t.name, image: t.image })),
    members,
    sessions,
  });
}
