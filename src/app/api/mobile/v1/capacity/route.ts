import type { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageCenterCapacity } from "@/lib/rbac";
import { getCentersForUser } from "@/lib/agenda-queries";
import { isCenterInScope } from "@/lib/center-scope";
import { occupiedSpots } from "@/lib/session-booking";
import { expandOccurrences, sessionsInRangeWhere } from "@/lib/session-occurrences";
import { parseDateParam, formatDateParam, zonedToday } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { sessionServiceKind } from "@/lib/session-balance";
import { MAX_GROUP_CAPACITY } from "@/app/(app)/agenda/agenda-utils";
import { requireApiRole } from "../_lib/api-session";
import { apiOk, apiError } from "../_lib/response";

/**
 * «Aforo de clases» (solo Entrenador Admin y dirección). La web deja fijar el
 * aforo POR DEFECTO del centro; en la sala lo que hace falta es otra cosa:
 * abrir o cerrar una plaza de la clase de HOY, con la ocupación delante.
 *
 * Las dos cosas conviven aquí: `centers` es el valor por defecto (el mismo que
 * la web) y `sessions` son las clases del día con su aforo real. Bajar el aforo
 * por debajo de la ocupación se rechaza: dejaría socios ya inscritos fuera de
 * una sesión a la que siguen apuntados.
 */
const CAPACITY_ROLES: Role[] = ["OWNER", "CENTER_DIRECTOR", "TRAINER_ADMIN"];

export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, CAPACITY_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageCenterCapacity(claims.role)) return apiError("No tienes permiso para gestionar el aforo.", 403);

  const user = { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId };
  const centers = await getCentersForUser(user);
  if (centers.length === 0) return apiOk({ date: null, centers: [], sessions: [] });

  const timezone = await resolveTimezoneForCenter(claims.centerId ?? centers[0].id);
  const dateParam = req.nextUrl.searchParams.get("date");
  const day = dateParam ? parseDateParam(dateParam) : zonedToday(timezone);
  const next = new Date(day);
  next.setDate(next.getDate() + 1);

  const raw = await prisma.classSession.findMany({
    where: {
      orgId: claims.orgId,
      status: "SCHEDULED",
      centerId: { in: centers.map((c) => c.id) },
      ...sessionsInRangeWhere(day, next),
    },
    select: {
      id: true,
      name: true,
      classType: true,
      startTime: true,
      endTime: true,
      capacity: true,
      centerId: true,
      date: true,
      recurrence: true,
      recUntil: true,
      center: { select: { name: true } },
      bookings: { select: { status: true, occurrenceDate: true } },
    },
  });

  const sessions = expandOccurrences(raw, day, next)
    .filter(({ session }) => sessionServiceKind(session.classType) === "GROUP")
    .map(({ session, date }) => {
      const booked = occupiedSpots(session.bookings, date);
      const waiting = session.bookings.filter(
        (b) => b.status === "WAITLISTED" && b.occurrenceDate.getTime() === date.getTime()
      ).length;
      return {
        id: session.id,
        occurrenceDate: formatDateParam(date),
        name: session.name,
        startTime: session.startTime,
        endTime: session.endTime,
        centerName: session.center.name,
        capacity: session.capacity,
        booked,
        waiting,
        full: booked >= session.capacity,
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return apiOk({
    date: formatDateParam(day),
    maxCapacity: MAX_GROUP_CAPACITY,
    centers: centers.map((c) => ({ id: c.id, name: c.name, defaultGroupCapacity: c.defaultGroupCapacity ?? null })),
    sessions,
  });
}

type PatchBody = { sessionId?: string; capacity?: number; centerId?: string; defaultGroupCapacity?: number | null };

export async function PATCH(req: NextRequest) {
  const auth = await requireApiRole(req, CAPACITY_ROLES);
  if (!auth.ok) return auth.response;
  const { claims } = auth;
  if (!canManageCenterCapacity(claims.role)) return apiError("No tienes permiso para gestionar el aforo.", 403);

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) return apiError("Petición vacía.", 400);
  const user = { id: claims.sub, role: claims.role, orgId: claims.orgId, centerId: claims.centerId };

  if (body.sessionId) {
    const capacity = Math.round(Number(body.capacity));
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > MAX_GROUP_CAPACITY) {
      return apiError(`El aforo va de 1 a ${MAX_GROUP_CAPACITY} plazas.`, 400);
    }
    const session = await prisma.classSession.findFirst({
      where: { id: body.sessionId, orgId: claims.orgId },
      select: { id: true, centerId: true, bookings: { select: { status: true, occurrenceDate: true } } },
    });
    if (!session) return apiError("Sesión no encontrada.", 404);
    if (!(await isCenterInScope(user, session.centerId))) return apiError("Sesión no encontrada.", 404);

    // El tope inferior es la ocupación real: bajar de ahí dejaría a socios ya
    // inscritos fuera de una sesión en la que siguen apuntados.
    const maxBooked = Math.max(
      0,
      ...session.bookings
        .filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW")
        .map((b) => b.occurrenceDate.getTime())
        .filter((time, index, all) => all.indexOf(time) === index)
        .map((time) => occupiedSpots(session.bookings, new Date(time)))
    );
    if (capacity < maxBooked) {
      return apiError(`Ya hay ${maxBooked} plazas ocupadas: cancela una reserva antes de bajar el aforo.`, 400);
    }

    await prisma.classSession.update({ where: { id: session.id }, data: { capacity } });
    return apiOk({ capacity });
  }

  if (body.centerId) {
    const value = body.defaultGroupCapacity;
    const capacity = value == null ? null : Math.round(Number(value));
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1 || capacity > MAX_GROUP_CAPACITY)) {
      return apiError(`El aforo por defecto va de 1 a ${MAX_GROUP_CAPACITY} plazas.`, 400);
    }
    if (!(await isCenterInScope(user, body.centerId))) return apiError("No se ha encontrado ese centro.", 404);
    const center = await prisma.center.findFirst({ where: { id: body.centerId, orgId: claims.orgId }, select: { id: true } });
    if (!center) return apiError("No se ha encontrado ese centro.", 404);

    await prisma.center.update({ where: { id: center.id }, data: { defaultGroupCapacity: capacity } });
    return apiOk({ defaultGroupCapacity: capacity });
  }

  return apiError("Indica la sesión o el centro cuyo aforo se cambia.", 400);
}
