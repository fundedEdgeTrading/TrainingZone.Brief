import type { ClassSession, NoShowReason, Prisma } from "@prisma/client";
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
import { sessionServiceKind, planServiceKind } from "@/lib/members-queries";
import {
  chargeSessionToSubscription,
  claimWaitlistedBooking,
  occupiedSpots,
  pickBookingSubscription,
  SERVICE_LABEL,
  shouldNotifyVacancy,
} from "@/lib/session-booking";
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
  const groupCapacityCeiling = center.defaultGroupCapacity ?? MAX_GROUP_CAPACITY;
  if (!isPersonal && input.capacity && input.capacity > groupCapacityCeiling) {
    return {
      ok: false as const,
      error: `El aforo máximo de este centro es ${groupCapacityCeiling} socios: no puedes crear una sesión con ${input.capacity} plazas.`,
    };
  }
  const capacity = isPersonal
    ? 1
    : Math.min(
        groupCapacityCeiling,
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
  // Con gente esperando, cualquier cancelación que libere plaza es un aviso que
  // dar: si el aforo se amplió después de formarse la lista, la sesión ya no
  // estaba "llena" y quien esperaba se quedaba sin enterarse del hueco.
  const hasWaitlist = dayBookings.some((b) => b.status === "WAITLISTED");

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

  if (shouldNotifyVacancy({ cancelledStatus: booking.status, wasFull, hasWaitlist })) {
    void notifySessionVacancy({ orgId, sessionId: booking.sessionId, occurrenceDate: booking.occurrenceDate });
  }

  return { ok: true as const };
}

/**
 * Socios a los que el staff puede dar una plaza en esta sesión: los que tienen
 * un bono ACTIVE de esa modalidad en el centro que la imparte (RB-AGENDA-003),
 * que es exactamente lo que exige `bookSessionForMemberAsStaff`.
 *
 * No vale el listado general de socios activos: ofrecía a toda la organización
 * —incluida gente sin bono de grupos, o de otro centro— y en cambio dejaba
 * fuera a quien está de prueba (`state` TRIAL), que es justo a quien más se
 * apunta a mano desde el mostrador.
 */
export async function listMembersBookableForSession(orgId: string, sessionId: string) {
  const session = await prisma.classSession.findFirst({
    where: { id: sessionId, orgId },
    select: { centerId: true, classType: true },
  });
  if (!session) return [];
  const kind = sessionServiceKind(session.classType);

  const members = await prisma.member.findMany({
    where: { orgId, subscriptions: { some: { status: "ACTIVE", centerId: session.centerId } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      subscriptions: {
        where: { status: "ACTIVE", centerId: session.centerId },
        select: { plan: { select: { type: true } } },
      },
    },
  });

  return members
    .filter((m) => m.subscriptions.some((s) => planServiceKind(s.plan.type) === kind))
    .map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
}

/**
 * Motivo por el que una reserva de staff no se puede aplicar. Se lanza dentro
 * de la transacción (en vez de devolverse) para que el descuento de bono que ya
 * hubiera hecho se deshaga con ella: devolver un objeto de error confirma la
 * transacción y dejaba la sesión cobrada y sin reservar.
 */
class StaffBookingError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

export type StaffBookingResult =
  | { ok: true; claimedFromWaitlist: boolean }
  | { ok: false; error: string };

/**
 * Reserva la plaza de un cliente concreto en una sesión, desde la agenda de
 * staff (el reverso de `cancelSessionBooking`). Es una acción PUNTUAL sobre un
 * día: no existe el "cliente fijo" de grupos reducidos —eso se queda en
 * Entrenamiento Personal—, así que reservar la ocurrencia del martes no apunta
 * a nadie a los martes siguientes.
 *
 * El bono se trata exactamente igual que cuando reserva el propio socio desde
 * la app (`bookSessionForMember`, portal-queries.ts): mismo bono elegido, mismo
 * descuento atómico y misma devolución al cancelar. Lo que NO se aplica son las
 * reglas de autoservicio del portal (antelación mínima, ventana de 7 días,
 * `selfBookable` en EP): quien está en el mostrador apunta a alguien a la clase
 * de dentro de diez minutos, que es justo lo que el socio no puede hacer solo.
 *
 * Si el cliente ya estaba en lista de espera, esto es su forma de reclamar la
 * plaza liberada (RB-RES-007): se pasa a BOOKED con la misma condición atómica
 * que usa el portal, así que si otro se ha adelantado, no se le cobra.
 */
export async function bookSessionForMemberAsStaff(
  orgId: string,
  input: { sessionId: string; memberId: string; occurrenceDate: Date }
): Promise<StaffBookingResult> {
  const day = startOfDay(input.occurrenceDate);
  try {
    return await prisma.$transaction(async (tx) => {
      // Mismo lock de fila que el portal: sin él, dos reservas simultáneas leen
      // el mismo aforo libre y ambas entran por encima de `capacity`.
      await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${input.sessionId} FOR UPDATE`;

      const cls = await tx.classSession.findFirst({
        where: { id: input.sessionId, orgId },
        select: {
          id: true,
          centerId: true,
          classType: true,
          capacity: true,
          status: true,
          date: true,
          recurrence: true,
          recUntil: true,
          bookings: { select: { id: true, memberId: true, status: true, occurrenceDate: true } },
        },
      });
      if (!cls) throw new StaffBookingError("Sesión no encontrada.");
      if (cls.status !== "SCHEDULED") throw new StaffBookingError("Esta sesión ya no admite reservas.");
      // El día llega de la URL de la agenda: en una serie recurrente solo vale
      // si la serie ocurre de verdad ese día (si no, la reserva quedaría en un
      // roster que no existe).
      if (!occursOn(cls, day)) throw new StaffBookingError("Esta sesión no se imparte ese día.");

      // El socio, contrastado contra la organización: sin esto bastaba conocer
      // un id ajeno para colar una reserva a nombre de alguien de otra.
      const member = await tx.member.findFirst({ where: { id: input.memberId, orgId }, select: { id: true } });
      if (!member) throw new StaffBookingError("Socio no encontrado.");

      const dayBookings = cls.bookings.filter((b) => isSameDay(b.occurrenceDate, day));
      const mine = dayBookings.filter((b) => b.memberId === member.id);
      if (mine.some((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW")) {
        throw new StaffBookingError("Ese socio ya tiene plaza en esta sesión.");
      }
      // Desde el mostrador no se apunta a nadie a la lista de espera: eso lo
      // hace el cliente desde la app. Aquí solo se ocupa una plaza que exista.
      if (occupiedSpots(dayBookings, day) >= cls.capacity) {
        throw new StaffBookingError("La sesión está completa: no quedan plazas libres ese día.");
      }

      const kind = sessionServiceKind(cls.classType);
      const subscriptions = await tx.subscription.findMany({
        where: { memberId: member.id, status: "ACTIVE" },
        select: { id: true, centerId: true, sessionsRemaining: true, plan: { select: { type: true } } },
      });
      const choice = pickBookingSubscription(subscriptions, {
        centerId: cls.centerId,
        kind,
        consumesSession: true,
      });
      if (!choice.ok) {
        throw new StaffBookingError(
          choice.reason === "NO_PLAN"
            ? `El bono de ese socio no incluye sesiones de ${SERVICE_LABEL[kind] ?? "este tipo"} en este centro.`
            : "A ese socio no le quedan sesiones en su bono."
        );
      }
      const chargeSubscriptionId = choice.subscriptionId;

      // Antes de escribir la reserva, para no dejarla creada sin cobrar.
      if (chargeSubscriptionId && !(await chargeSessionToSubscription(tx, chargeSubscriptionId))) {
        throw new StaffBookingError("A ese socio no le quedan sesiones en su bono.");
      }

      const waiting = mine.find((b) => b.status === "WAITLISTED");
      if (waiting) {
        if (!(await claimWaitlistedBooking(tx, waiting.id, chargeSubscriptionId))) {
          // Lanzar deshace también el descuento de bono de más arriba: nadie
          // paga una plaza que se quedó otro.
          throw new StaffBookingError("Esa plaza ya la ha reclamado otra persona.");
        }
        return { ok: true as const, claimedFromWaitlist: true };
      }

      await tx.booking.create({
        data: {
          sessionId: cls.id,
          occurrenceDate: day,
          memberId: member.id,
          status: "BOOKED",
          subscriptionId: chargeSubscriptionId,
        },
      });
      return { ok: true as const, claimedFromWaitlist: false };
    });
  } catch (error) {
    if (error instanceof StaffBookingError) return { ok: false as const, error: error.reason };
    throw error;
  }
}

/**
 * RB-RES-009: marca la reserva como falta, con motivo, y aplica la decisión del
 * entrenador sobre el bono.
 *
 * Hasta ahora una falta no devolvía nunca la sesión (a diferencia de la
 * cancelación a tiempo, RB-RES-006) y tampoco dejaba rastro de por qué: una
 * gripe avisada y un plantón acababan en el mismo `NO_SHOW`. Ahora el motivo es
 * obligatorio y la devolución es una decisión explícita, caso a caso.
 *
 * La devolución reutiliza la misma mecánica que `cancelSessionBooking`
 * (`Subscription.sessionsRemaining` + 1 sobre el bono del que salió la reserva),
 * pero se cierra sobre `noShowRefunded` en vez de sobre `subscriptionId`: la
 * reserva conserva su bono, así que rectificar la falta puede volver a
 * descontarla (`clearBookingNoShow`). Que el incremento vaya condicionado a que
 * la bandera pase de false a true es lo que impide devolver dos veces la misma
 * sesión si se marca dos veces (o dos personas a la vez).
 */
export async function markBookingNoShow(
  orgId: string,
  bookingId: string,
  opts: { sessionId: string; reason: NoShowReason; refundSession: boolean }
) {
  const booking = await prisma.booking.findFirst({
    // Acotado a la sesión Y a la organización, igual que el check-in: el id de
    // la reserva viaja desde el cliente y por sí solo no dice de quién es.
    //
    // WAITLISTED y CANCELLED quedan fuera: no hay asistencia que registrar en
    // una reserva que nunca ocupó plaza. ATTENDED sí entra, porque marcar la
    // falta es también rectificar un check-in dado por error.
    where: {
      id: bookingId,
      sessionId: opts.sessionId,
      session: { orgId },
      status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] },
    },
    select: { id: true, memberId: true, subscriptionId: true, noShowRefunded: true },
  });
  if (!booking) return { ok: false as const, error: "No se ha encontrado esa reserva." };

  const refunded = await prisma.$transaction(async (tx) => {
    const applied = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
      data: { status: "NO_SHOW", checkedInAt: null, noShowReason: opts.reason },
    });
    if (applied.count === 0) return null;

    // Sin bono del que salió la reserva no hay nada que devolver (cuota
    // ilimitada, o sesión agendada sin cargo).
    if (!opts.refundSession || !booking.subscriptionId) return booking.noShowRefunded;

    const claimed = await tx.booking.updateMany({
      where: { id: booking.id, noShowRefunded: false },
      data: { noShowRefunded: true },
    });
    if (claimed.count > 0) {
      await tx.subscription.update({
        where: { id: booking.subscriptionId },
        data: { sessionsRemaining: { increment: 1 } },
      });
    }
    return true;
  });
  if (refunded === null) return { ok: false as const, error: "No se ha encontrado esa reserva." };

  return { ok: true as const, memberId: booking.memberId, refunded };
}

/**
 * Deshace una falta: la reserva vuelve al estado que se le indique (asistió, o
 * de nuevo reservada) y se borra el motivo. Si la falta había devuelto la
 * sesión al bono, se vuelve a descontar — si no, rectificar un "No asistió"
 * marcado por error regalaría una sesión cada vez.
 */
export async function clearBookingNoShow(orgId: string, bookingId: string, nextStatus: "BOOKED" | "ATTENDED") {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, session: { orgId } },
    select: { id: true, subscriptionId: true, noShowRefunded: true },
  });
  if (!booking) return { ok: false as const, error: "No se ha encontrado esa reserva." };

  await prisma.$transaction(async (tx) => {
    // La bandera es también aquí el cierre de la operación, en el mismo UPDATE
    // que la baja: dos rectificaciones simultáneas no pueden descontar dos
    // veces una sesión que solo se devolvió una.
    const released = await tx.booking.updateMany({
      where: { id: booking.id, noShowRefunded: true },
      data: { noShowRefunded: false },
    });
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: nextStatus,
        checkedInAt: nextStatus === "ATTENDED" ? new Date() : null,
        noShowReason: null,
      },
    });

    if (released.count === 0 || !booking.subscriptionId) return;
    // Solo se descuenta si el bono tiene saldo: dejarlo en negativo rompería
    // las cuentas de `bonoUsage` (session-balance.ts). Un bono ilimitado
    // (`sessionsRemaining` null) no se toca: NULL - 1 sigue siendo NULL.
    await tx.subscription.updateMany({
      where: { id: booking.subscriptionId, sessionsRemaining: { gt: 0 } },
      data: { sessionsRemaining: { decrement: 1 } },
    });
  });

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
