import { prisma } from "@/lib/prisma";
import { canManageOrg } from "@/lib/rbac";
import type { Role } from "@prisma/client";

/**
 * Centros visibles para un usuario según su imputación real:
 * - OWNER / PLATFORM_ADMIN: todos los centros de la organización.
 * - Resto de staff: su centro base (`centerId`) más los centros donde tenga
 *   una fila en `CenterMembership` (imputación multi-centro).
 */
export async function getCentersForUser(user: {
  id: string;
  role: Role;
  orgId: string;
  centerId: string | null;
}) {
  if (canManageOrg(user.role)) {
    return prisma.center.findMany({ where: { orgId: user.orgId }, orderBy: { name: "asc" } });
  }

  const memberships = await prisma.centerMembership.findMany({
    where: { userId: user.id, orgId: user.orgId },
    select: { centerId: true },
  });
  const ids = new Set<string>(memberships.map((m) => m.centerId));
  if (user.centerId) ids.add(user.centerId);

  return prisma.center.findMany({
    where: { orgId: user.orgId, id: { in: [...ids] } },
    orderBy: { name: "asc" },
  });
}

/**
 * Sesiones "candidatas" a mostrarse en la semana [weekStart, weekEnd): las que
 * caen literalmente en el rango, más las series recurrentes nacidas antes de
 * la semana y aún no finalizadas (`recUntil` nulo o posterior a weekStart).
 * La proyección exacta día/semana (¿le toca ocurrencia esta semana?) se
 * resuelve en el llamador con `instanceForWeek` (agenda-utils.ts).
 */
export async function getWeekSessions(orgId: string, centerId: string, weekStart: Date, weekEnd: Date) {
  const sessions = await prisma.classSession.findMany({
    where: {
      orgId,
      centerId,
      OR: [
        { date: { gte: weekStart, lt: weekEnd } },
        {
          recurrence: { not: "NONE" },
          date: { lt: weekEnd },
          OR: [{ recUntil: null }, { recUntil: { gte: weekStart } }],
        },
      ],
    },
    include: {
      trainer: { select: { name: true } },
      bookings: { select: { id: true, status: true, memberId: true } },
    },
    orderBy: { date: "asc" },
  });
  return sessions;
}

export type SaveSessionInput = {
  id?: string | null;
  centerId: string;
  trainerId: string;
  title: string;
  type: "personal" | "reduced";
  date: Date;
  startTime: string;
  endTime: string;
  memberId: string | null;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil: Date | null;
};

/** Crea o actualiza una sesión de la agenda (rediseño estilo Google Calendar). */
export async function saveSession(orgId: string, input: SaveSessionInput) {
  const classType = input.type === "personal" ? "Personal Training" : "Grupo reducido";
  const capacity = input.type === "personal" ? 1 : 6;
  const data = {
    centerId: input.centerId,
    trainerId: input.trainerId,
    name: input.title,
    classType,
    capacity,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    isTrial: input.isTrial,
    recurrence: input.recurrence,
    recUntil: input.recUntil,
  };

  let session;
  if (input.id) {
    session = await prisma.classSession.update({ where: { id: input.id, orgId }, data });
    await prisma.booking.deleteMany({ where: { sessionId: session.id, status: { not: "CANCELLED" } } });
  } else {
    session = await prisma.classSession.create({ data: { ...data, orgId } });
  }

  if (input.memberId) {
    await prisma.booking.create({ data: { sessionId: session.id, memberId: input.memberId, status: "BOOKED" } });
  }

  return session;
}

export async function deleteSession(orgId: string, sessionId: string) {
  const session = await prisma.classSession.findFirst({ where: { id: sessionId, orgId }, select: { id: true } });
  if (!session) return { ok: false as const, error: "Sesión no encontrada." };
  await prisma.booking.deleteMany({ where: { sessionId } });
  await prisma.classSession.delete({ where: { id: sessionId } });
  return { ok: true as const };
}

/** Arrastrar y soltar: reprograma día/hora conservando la duración original. */
export async function rescheduleSession(orgId: string, sessionId: string, date: Date, startTime: string, endTime: string) {
  const session = await prisma.classSession.findFirst({ where: { id: sessionId, orgId }, select: { id: true } });
  if (!session) return { ok: false as const, error: "Sesión no encontrada." };
  await prisma.classSession.update({ where: { id: sessionId }, data: { date, startTime, endTime } });
  return { ok: true as const };
}

function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * RB-AGENDA-002/006: crea un hueco de EP. Por defecto lo agenda el entrenador
 * (reserva manual en nombre de un cliente que no usa la app); si se marca
 * `selfBookable`, queda disponible para que el propio cliente de EP lo coja
 * desde el portal (RB-AGENDA-001).
 */
export async function createEpSlot(
  orgId: string,
  input: { centerId: string; trainerId: string; date: Date; startTime: string; durationMin: number; selfBookable: boolean; memberId?: string | null }
) {
  const endTime = addMinutesToTime(input.startTime, input.durationMin);
  const session = await prisma.classSession.create({
    data: {
      orgId,
      centerId: input.centerId,
      name: `Personal Training ${input.startTime}`,
      classType: "Personal Training",
      date: input.date,
      startTime: input.startTime,
      endTime,
      capacity: 1,
      trainerId: input.trainerId,
      selfBookable: input.selfBookable,
    },
  });

  if (input.memberId) {
    await prisma.booking.create({ data: { sessionId: session.id, memberId: input.memberId, status: "BOOKED" } });
  }

  return session;
}

/** RB-AGENDA-004: entrenador que dirigió realmente la sesión (puede diferir del asignado). */
export async function setSessionDirector(orgId: string, sessionId: string, directedByUserId: string | null) {
  const session = await prisma.classSession.findFirst({ where: { id: sessionId, orgId }, select: { id: true } });
  if (!session) return { ok: false as const, error: "Sesión no encontrada." };
  await prisma.classSession.update({ where: { id: sessionId }, data: { directedByUserId } });
  return { ok: true as const };
}

export async function setSessionSelfBookable(orgId: string, sessionId: string, selfBookable: boolean) {
  const session = await prisma.classSession.findFirst({ where: { id: sessionId, orgId, classType: "Personal Training" }, select: { id: true } });
  if (!session) return { ok: false as const, error: "Sesión no encontrada o no es de EP." };
  await prisma.classSession.update({ where: { id: sessionId }, data: { selfBookable } });
  return { ok: true as const };
}

export async function getSessionDetail(orgId: string, sessionId: string) {
  return prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    include: {
      center: true,
      trainer: { select: { name: true } },
      directedBy: { select: { id: true, name: true } },
      bookings: {
        include: { member: { select: { id: true, firstName: true, lastName: true, state: true } } },
        orderBy: [{ status: "asc" }, { bookedAt: "asc" }],
      },
    },
  });
}
