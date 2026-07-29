import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCentersForUser } from "@/lib/agenda-queries";
import { listAssignableStaff } from "@/lib/org-queries";
import { listActiveMembersForSelect } from "@/lib/members-queries";
import { canManageEpSlots } from "@/lib/rbac";
import { formatDateParam, parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { expandOccurrences, isSameDay, sessionsInRangeWhere } from "@/lib/session-occurrences";
import { requireApiRole } from "../_lib/api-session";
import { apiOk } from "../_lib/response";

const STAFF_AGENDA_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "RECEPTION"] as const;

// Agenda operativa (día) para entrenador/dirección: espejo simplificado de
// src/app/(app)/agenda/page.tsx, pensado para crear/editar sesiones desde el móvil.
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, [...STAFF_AGENDA_ROLES]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const centers = await getCentersForUser({ id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId });
  const centerParam = req.nextUrl.searchParams.get("centerId");
  const centerId = centerParam || claims.centerId || centers[0]?.id || null;

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
            trainer: { select: { id: true, name: true } },
            bookings: {
              where: { status: { not: "CANCELLED" } },
              select: { id: true, status: true, occurrenceDate: true, member: { select: { id: true, firstName: true, lastName: true } } },
            },
          },
          orderBy: { startTime: "asc" },
        }),
        listAssignableStaff(claims.orgId, ["TRAINER"]),
        listActiveMembersForSelect(claims.orgId),
      ])
    : [[], [], []];

  const sessions = expandOccurrences(rows, day, dayEnd).map(({ session: s, date }) => ({
    id: s.id,
    name: s.name,
    classType: s.classType,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    isTrial: s.isTrial,
    recurrence: s.recurrence,
    selfBookable: s.selfBookable,
    trainerId: s.trainerId,
    trainerName: s.trainer?.name ?? null,
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
    trainers: trainers.map((t) => ({ id: t.id, name: t.name })),
    members,
    sessions,
  });
}
