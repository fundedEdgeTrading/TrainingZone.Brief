import type { ClassSession, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { centerScopeFor, type ScopedUser } from "@/lib/center-scope";
import { isSameDay, occursOn, resolveOccurrenceDate } from "@/lib/session-occurrences";
import {
  dayDelta,
  effectiveScope,
  nextOccurrenceAfter,
  startOfDay,
  truncatedRecUntil,
  type EditScope,
} from "@/lib/session-series";
import { notifySessionVacancy } from "@/lib/session-vacancy-notify";
import { addDays, DEFAULT_GROUP_CAPACITY, MAX_GROUP_CAPACITY } from "@/app/(app)/agenda/agenda-utils";

/**
 * Centros visibles para un usuario según su imputación real:
 * - OWNER / PLATFORM_ADMIN: todos los centros de la organización.
 * - Resto de staff: su centro base (`centerId`) más los centros donde tenga
 *   una fila en `CenterMembership` (imputación multi-centro).
 */
export async function getCentersForUser(user: ScopedUser) {
  // El "qué centros son suyos" lo decide `center-scope.ts` para toda la app:
  // aquí solo se hidratan las filas.
  const scope = await centerScopeFor(user);
  return prisma.center.findMany({
    where: { orgId: user.orgId, ...(scope === null ? {} : { id: { in: scope } }) },
    orderBy: { name: "asc" },
  });
}

/**
 * Sesiones "candidatas" a mostrarse en la semana [weekStart, weekEnd): las que
 * caen literalmente en el rango, más las series recurrentes nacidas antes de
 * la semana y aún no finalizadas (`recUntil` nulo o posterior a weekStart).
 * La proyección exacta día/semana (¿le toca ocurrencia esta semana?) se
 * resuelve en el llamador con `instancesForWeek` (agenda-utils.ts).
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
      bookings: {
        select: {
          id: true,
          status: true,
          memberId: true,
          occurrenceDate: true,
          // El nombre es lo único que falta para que la tarjeta de EP diga
          // quién ocupa la franja en vez de un genérico "reservada".
          member: { select: { firstName: true, lastName: true } },
        },
      },
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
  /**
   * Alcance de la edición cuando la sesión se repite en el tiempo (ver
   * `session-series.ts`). Solo se tiene en cuenta al editar (`id`).
   */
  scope?: EditScope;
  /**
   * Día de la serie que se estaba editando (el que se pulsó en la agenda). Sin
   * él la edición se aplicaba siempre desde la fecha base de la serie.
   */
  occurrenceDate?: Date | null;
};

/**
 * Copia literal de una fila de sesión, lista para `create`. Al partir una serie
 * hay que duplicar también lo que el diálogo no toca (plantilla, sala, estado,
 * quién la dirigió): si no, el trozo nuevo nacía descolgado de su origen.
 */
function rowCopy(s: ClassSession) {
  return {
    orgId: s.orgId,
    centerId: s.centerId,
    templateId: s.templateId,
    name: s.name,
    classType: s.classType,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    room: s.room,
    trainerId: s.trainerId,
    status: s.status,
    selfBookable: s.selfBookable,
    directedByUserId: s.directedByUserId,
    recurrence: s.recurrence,
    recUntil: s.recUntil,
  };
}

/** Reservas afectadas por el alcance de la edición, dentro de una misma serie. */
function bookingScopeWhere(scope: EditScope, day: Date) {
  if (scope === "future") return { occurrenceDate: { gte: day } };
  if (scope === "single") return { occurrenceDate: day };
  return {};
}

/**
 * Reengancha las reservas al trozo de serie que les corresponde y, si el día se
 * ha movido, las lleva consigo. Sin esto, partir una serie dejaba a los socios
 * apuntando a la fila vieja: desaparecían del roster y de "mis próximas
 * reservas" sin que nadie los hubiera cancelado.
 */
async function moveBookings(
  tx: Prisma.TransactionClient,
  fromSessionId: string,
  toSessionId: string,
  delta: number,
  where: Prisma.BookingWhereInput
) {
  if (delta === 0 && fromSessionId === toSessionId) return;
  const rows = await tx.booking.findMany({
    where: { sessionId: fromSessionId, ...where },
    select: { id: true, occurrenceDate: true },
  });
  for (const b of rows) {
    await tx.booking.update({
      where: { id: b.id },
      data: {
        sessionId: toSessionId,
        occurrenceDate: delta === 0 ? b.occurrenceDate : addDays(b.occurrenceDate, delta),
      },
    });
  }
}

/** Crea o actualiza una sesión de la agenda (rediseño estilo Google Calendar). */
export async function saveSession(orgId: string, input: SaveSessionInput) {
  // Centro, entrenador y socio llegan tal cual del formulario. Sin contrastarlos
  // contra la organización, quien pudiera tocar la agenda de su propio centro
  // podía crear una sesión apuntando al centro o al entrenador de otra
  // organización, y sobre todo colar una reserva a nombre de un socio ajeno sin
  // más que conocer su id.
  const [center, trainer] = await Promise.all([
    prisma.center.findFirst({ where: { id: input.centerId, orgId }, select: { id: true, defaultGroupCapacity: true } }),
    // Y además imputado a ESE centro: una sesión de La Jota a nombre de una
    // entrenadora que solo trabaja en Santander no la puede dar nadie, y en el
    // panel de ella aparecía como suya.
    prisma.user.findFirst({
      where: {
        id: input.trainerId,
        orgId,
        OR: [{ centerId: input.centerId }, { centerMemberships: { some: { centerId: input.centerId } } }],
      },
      select: { id: true },
    }),
  ]);
  if (!center) return { ok: false as const, error: "Centro no encontrado." };
  if (!trainer) return { ok: false as const, error: "Ese entrenador no está imputado a este centro." };

  if (input.memberId) {
    const member = await prisma.member.findFirst({ where: { id: input.memberId, orgId }, select: { id: true } });
    if (!member) return { ok: false as const, error: "Socio no encontrado." };
  }

  const existing = input.id ? await prisma.classSession.findFirst({ where: { id: input.id, orgId } }) : null;
  if (input.id && !existing) return { ok: false as const, error: "Sesión no encontrada." };

  const isPersonal = input.type === "personal";
  const classType = isPersonal ? "Personal Training" : "Grupo reducido";
  const capacity = isPersonal
    ? 1
    : Math.min(
        MAX_GROUP_CAPACITY,
        Math.max(1, Math.round(input.capacity || center.defaultGroupCapacity || DEFAULT_GROUP_CAPACITY))
      );

  // Qué día de la serie se estaba editando, qué alcance pidió el usuario y
  // cuánto se ha movido ese día. `delta` se mide contra el día editado, no
  // contra la fecha base: en una serie, la fecha del diálogo es la de la
  // ocurrencia que se abrió.
  const editedDay = existing
    ? existing.recurrence !== "NONE" && input.occurrenceDate && occursOn(existing, input.occurrenceDate)
      ? startOfDay(input.occurrenceDate)
      : startOfDay(existing.date)
    : startOfDay(input.date);
  const scope: EditScope = existing ? effectiveScope(existing, editedDay, input.scope ?? "all") : "all";
  const delta = existing ? dayDelta(editedDay, input.date) : 0;

  // Bajar el aforo por debajo de las reservas que ya existen dejaba el grupo
  // sobrevendido en silencio (la rejilla lo pintaba al 100% y el socio 5 se
  // quedaba sin plaza sin enterarse). Se mide la ocurrencia más llena de LAS
  // AFECTADAS: al editar un solo día no importa lo llena que estuviera otra.
  if (!isPersonal && existing) {
    const bookings = await prisma.booking.findMany({
      where: { sessionId: existing.id, ...bookingScopeWhere(scope, editedDay) },
      select: { status: true, occurrenceDate: true },
    });
    const perDay = new Map<number, number>();
    for (const b of bookings) {
      if (b.status !== "BOOKED" && b.status !== "ATTENDED" && b.status !== "NO_SHOW") continue;
      const key = new Date(b.occurrenceDate).setHours(0, 0, 0, 0);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }
    const busiest = Math.max(0, ...perDay.values());
    if (busiest > capacity) {
      return { ok: false as const, error: `Ya hay ${busiest} reservas: no puedes bajar el aforo de ${busiest}.` };
    }
  }

  const data = {
    centerId: input.centerId,
    trainerId: input.trainerId,
    name: input.title,
    classType,
    capacity,
    date: startOfDay(input.date),
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
  if (!existing) {
    session = await prisma.classSession.create({ data: { ...data, orgId } });
  } else if (scope === "all") {
    // Toda la serie, incluido el pasado. La fecha del formulario es la del día
    // que se abrió, así que la base se desplaza lo mismo que se movió ese día
    // (con `delta` 0 no se toca y el pasado se queda donde estaba).
    session = await prisma.$transaction(async (tx) => {
      const updated = await tx.classSession.update({
        where: { id: existing.id },
        data: { ...data, date: addDays(startOfDay(existing.date), delta) },
      });
      await moveBookings(tx, existing.id, updated.id, delta, {});
      return updated;
    });
  } else if (scope === "future") {
    // El pasado se queda intacto en la fila original, recortada la víspera del
    // día editado; lo nuevo nace como serie aparte con los cambios.
    session = await prisma.$transaction(async (tx) => {
      await tx.classSession.update({
        where: { id: existing.id },
        data: { recUntil: truncatedRecUntil(existing, editedDay) },
      });
      const created = await tx.classSession.create({ data: { ...rowCopy(existing), ...data } });
      await moveBookings(tx, existing.id, created.id, delta, { occurrenceDate: { gte: editedDay } });
      return created;
    });
  } else {
    // Solo ese día: sale de la serie como sesión suelta y la serie se recompone
    // alrededor (el tramo anterior y, si sigue, el posterior).
    session = await prisma.$transaction(async (tx) => {
      const next = nextOccurrenceAfter(existing, editedDay);
      if (startOfDay(existing.date) < editedDay) {
        await tx.classSession.update({
          where: { id: existing.id },
          data: { recUntil: truncatedRecUntil(existing, editedDay) },
        });
        if (next) {
          const rest = await tx.classSession.create({ data: { ...rowCopy(existing), date: next } });
          await moveBookings(tx, existing.id, rest.id, 0, { occurrenceDate: { gt: editedDay } });
        }
      } else if (next) {
        // Se edita la primera ocurrencia: la fila original se queda con el
        // resto de la serie (y con sus reservas, que ya apuntan ahí).
        await tx.classSession.update({ where: { id: existing.id }, data: { date: next } });
      }
      const created = await tx.classSession.create({
        data: { ...rowCopy(existing), ...data, recurrence: "NONE" as const, recUntil: null },
      });
      await moveBookings(tx, existing.id, created.id, delta, { occurrenceDate: editedDay });
      return created;
    });
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
        occurrenceDate: startOfDay(input.date),
        status: { notIn: ["CANCELLED"] },
      },
      select: { id: true },
    });
    if (!alreadyBooked) {
      await prisma.booking.create({
        data: { sessionId: session.id, occurrenceDate: startOfDay(input.date), memberId: input.memberId, status: "BOOKED" },
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

  // Igual que en la cancelación del socio (portal-queries.ts): la condición de
  // "sigue activa" va dentro del UPDATE, para que dos cancelaciones simultáneas
  // no devuelvan el bono dos veces.
  const cancelled = await prisma.$transaction(async (tx) => {
    const applied = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["BOOKED", "WAITLISTED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null },
    });
    if (applied.count === 0) return false;

    // RB-RES-006: la lista de espera nunca descontó bono, así que no se devuelve.
    if (booking.status === "BOOKED" && booking.subscriptionId) {
      await tx.subscription.update({
        where: { id: booking.subscriptionId },
        data: { sessionsRemaining: { increment: 1 } },
      });
    }
    return true;
  });
  if (!cancelled) return { ok: false as const, error: "No se ha encontrado esa reserva activa." };

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

/**
 * Suma minutos a un "HH:MM" SIN cruzar la medianoche: se topa en 23:59. Con el
 * `% 24` anterior, una franja que empezara a las 23:45 acababa a las "00:15",
 * anterior a su propia hora de inicio, y la duración salía negativa.
 */
function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
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
/**
 * Centro al que pertenece una sesión de ESTA organización (`null` si no existe).
 *
 * Es la pieza que le faltaba a las guardas de la agenda: `requireCenterRole`
 * comprobaba el `centerId` que venía en el formulario, no el de la sesión que
 * se iba a tocar. Con los dos desacoplados, mandar el centro propio junto al id
 * de una sesión ajena bastaba para borrarla, moverla o cambiarle el
 * responsable desde otro centro de la organización.
 */
export async function getSessionCenterId(orgId: string, sessionId: string): Promise<string | null> {
  const found = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    select: { centerId: true },
  });
  return found?.centerId ?? null;
}

/** Igual, partiendo de una reserva: su sesión es la que manda el centro. */
export async function getBookingCenterId(orgId: string, bookingId: string): Promise<string | null> {
  const found = await prisma.booking.findFirst({
    where: { id: bookingId, session: { orgId } },
    select: { session: { select: { centerId: true } } },
  });
  return found?.session.centerId ?? null;
}

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
