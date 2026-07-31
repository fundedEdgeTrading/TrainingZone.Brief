import { prisma } from "@/lib/prisma";
import { canManageOrg } from "@/lib/rbac";
import { isSameDay, resolveOccurrenceDate } from "@/lib/session-occurrences";
import { notifySessionVacancy } from "@/lib/session-vacancy-notify";
import { DEFAULT_GROUP_CAPACITY, MAX_GROUP_CAPACITY } from "@/app/(app)/agenda/agenda-utils";
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
      bookings: { select: { id: true, status: true, memberId: true, occurrenceDate: true } },
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
  capacity?: number | null;
  /** RB-AGENDA-002: la franja queda abierta a que el socio la reserve desde el portal. */
  selfBookable: boolean;
  isTrial: boolean;
  recurrence: "NONE" | "WEEKLY" | "WEEKDAYS";
  recUntil: Date | null;
};

/** Crea o actualiza una sesión de la agenda (rediseño estilo Google Calendar). */
export async function saveSession(orgId: string, input: SaveSessionInput) {
  // Centro, entrenador y socio llegan tal cual del formulario. Sin contrastarlos
  // contra la organización, quien pudiera tocar la agenda de su propio centro
  // podía crear una sesión apuntando al centro o al entrenador de otra
  // organización, y sobre todo colar una reserva a nombre de un socio ajeno sin
  // más que conocer su id.
  const [center, trainer] = await Promise.all([
    prisma.center.findFirst({ where: { id: input.centerId, orgId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: input.trainerId, orgId }, select: { id: true } }),
  ]);
  if (!center) return { ok: false as const, error: "Centro no encontrado." };
  if (!trainer) return { ok: false as const, error: "Entrenador no encontrado." };

  if (input.memberId) {
    const member = await prisma.member.findFirst({ where: { id: input.memberId, orgId }, select: { id: true } });
    if (!member) return { ok: false as const, error: "Socio no encontrado." };
  }

  const isPersonal = input.type === "personal";
  const classType = isPersonal ? "Personal Training" : "Grupo reducido";
  const capacity = isPersonal
    ? 1
    : Math.min(MAX_GROUP_CAPACITY, Math.max(1, Math.round(input.capacity || DEFAULT_GROUP_CAPACITY)));
  const data = {
    centerId: input.centerId,
    trainerId: input.trainerId,
    name: input.title,
    classType,
    capacity,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    // Solo el EP distingue entre franja abierta al socio y franja que gestiona
    // el entrenador: los grupos reducidos son siempre reservables por el
    // cliente (RB-AGENDA-001), así que el flag no les aplica.
    selfBookable: isPersonal ? input.selfBookable : false,
    isTrial: input.isTrial,
    recurrence: input.recurrence,
    recUntil: input.recUntil,
  };

  let session;
  if (input.id) {
    session = await prisma.classSession.update({ where: { id: input.id, orgId }, data });
  } else {
    session = await prisma.classSession.create({ data: { ...data, orgId } });
  }

  // El campo "Socio" del diálogo es la reserva MANUAL de una franja de EP en
  // nombre de un cliente que no usa la app; nunca es el roster de la sesión.
  //
  // Antes se sincronizaba el roster entero con ese único socio: como en un
  // grupo reducido el campo va vacío, volver a guardar la sesión (cambiar la
  // hora, el título, el entrenador…) cancelaba TODAS las reservas que habían
  // hecho los socios, sin devolverles el bono, y el entrenador se encontraba el
  // brief vacío. Ahora solo se añade la reserva que falta, y no se toca ninguna
  // que no haya creado este mismo campo.
  if (isPersonal && input.memberId) {
    const alreadyBooked = await prisma.booking.findFirst({
      where: {
        sessionId: session.id,
        memberId: input.memberId,
        occurrenceDate: input.date,
        status: { notIn: ["CANCELLED"] },
      },
      select: { id: true },
    });
    if (!alreadyBooked) {
      await prisma.booking.create({
        data: { sessionId: session.id, occurrenceDate: input.date, memberId: input.memberId, status: "BOOKED" },
      });
    }
  }

  return { ok: true as const, session };
}

/**
 * Cancela la reserva que el entrenador había agendado a mano en una franja de
 * EP (el reverso de dejar vacío el campo "Socio" del diálogo). Se hace desde
 * una acción explícita y no al guardar, para no volver a barrer reservas que el
 * socio hizo por su cuenta. Devuelve el bono, igual que si cancelara el socio.
 */
export async function cancelSessionBooking(orgId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, session: { orgId }, status: { in: ["BOOKED", "WAITLISTED"] } },
    select: {
      id: true,
      status: true,
      subscriptionId: true,
      sessionId: true,
      occurrenceDate: true,
      session: { select: { capacity: true, bookings: { select: { status: true, occurrenceDate: true } } } },
    },
  });
  if (!booking) return { ok: false as const, error: "No se ha encontrado esa reserva activa." };

  // RB-RES-007: mismo aviso de hueco liberado que en la cancelación del
  // propio socio, medido antes de cancelar (ver portal-queries.ts).
  const dayBookings = booking.session.bookings.filter((b) => isSameDay(b.occurrenceDate, booking.occurrenceDate));
  const activeCountBefore = dayBookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW").length;
  const wasFull = activeCountBefore >= booking.session.capacity;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null },
    });
    // RB-RES-006: la lista de espera nunca descontó bono, así que no se devuelve.
    if (booking.status === "BOOKED" && booking.subscriptionId) {
      await tx.subscription.update({
        where: { id: booking.subscriptionId },
        data: { sessionsRemaining: { increment: 1 } },
      });
    }
  });

  if (booking.status === "BOOKED" && wasFull) {
    void notifySessionVacancy({ orgId, sessionId: booking.sessionId, occurrenceDate: booking.occurrenceDate });
  }

  return { ok: true as const };
}

export async function deleteSession(orgId: string, sessionId: string) {
  const session = await prisma.classSession.findFirst({ where: { id: sessionId, orgId }, select: { id: true } });
  if (!session) return { ok: false as const, error: "Sesión no encontrada." };
  // Borrar la sesión implica borrar también sus reservas y, si las hay,
  // los debriefs asociados (FK RESTRICT: Booking <- SessionDebrief).
  await prisma.sessionDebrief.deleteMany({ where: { booking: { sessionId } } });
  await prisma.booking.deleteMany({ where: { sessionId } });
  await prisma.classSession.delete({ where: { id: sessionId } });
  return { ok: true as const };
}

/** Arrastrar y soltar: reprograma día/hora conservando la duración original. */
export async function rescheduleSession(orgId: string, sessionId: string, date: Date, startTime: string, endTime: string) {
  const session = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    select: { id: true, date: true, recurrence: true },
  });
  if (!session) return { ok: false as const, error: "Sesión no encontrada." };

  await prisma.$transaction(async (tx) => {
    await tx.classSession.update({ where: { id: sessionId }, data: { date, startTime, endTime } });
    // Mover una sesión suelta se lleva consigo a quien ya la había reservado:
    // si no, la reserva se quedaba apuntando al día viejo y desaparecía del
    // roster de la sesión y de "tus próximas reservas".
    if (session.recurrence === "NONE") {
      await tx.booking.updateMany({
        where: { sessionId, occurrenceDate: session.date },
        data: { occurrenceDate: date },
      });
    }
  });
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
    await prisma.booking.create({
      data: { sessionId: session.id, occurrenceDate: input.date, memberId: input.memberId, status: "BOOKED" },
    });
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

/**
 * Detalle de una sesión con el roster del día que se está mirando (`d`,
 * "YYYY-MM-DD"): en una serie recurrente todas las ocurrencias comparten fila,
 * así que sin acotar por `occurrenceDate` el entrenador veía en el martes a
 * quien había reservado el martes siguiente.
 */
export async function getSessionDetail(orgId: string, sessionId: string, d?: string | null) {
  const session = await prisma.classSession.findFirst({
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
  if (!session) return null;

  const occurrenceDate = resolveOccurrenceDate(session, d);
  return {
    ...session,
    occurrenceDate,
    bookings: session.bookings.filter((b) => isSameDay(b.occurrenceDate, occurrenceDate)),
  };
}
