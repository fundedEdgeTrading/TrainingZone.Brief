import { prisma } from "@/lib/prisma";
import { buildCompositionView } from "@/lib/composition-view";
import { sessionServiceKind, planServiceKind } from "@/lib/members-queries";
import { notifySessionVacancy } from "@/lib/session-vacancy-notify";
import { zonedNow, zonedToday, zonedTimeToInstant, parseDateParam, formatDateParam, DEFAULT_TIMEZONE } from "@/lib/date-utils";
import { expandOccurrences, occursOn, sessionsInRangeWhere } from "@/lib/session-occurrences";
import { isOperatingDay } from "@/app/(app)/agenda/agenda-utils";

// RB-PERFIL-004/portal: el socio ve su propio seguimiento de fotos y evolución (misma vista
// de composición corporal que su entrenador consulta en la ficha del socio), sujeto a los
// mismos consentimientos (Art. 9 RGPD) que ya firmó en su onboarding.
export async function getMemberEvolution(memberId: string, orgId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      birthDate: true,
      consentHealth: true,
      consentImages: true,
      progressEntries: { orderBy: { date: "desc" } },
    },
  });
  if (!member) return null;

  const view = await buildCompositionView(orgId, member.birthDate, member.progressEntries);
  return {
    consentHealth: member.consentHealth,
    consentImages: member.consentImages,
    progressEntries: member.progressEntries,
    ...view,
  };
}

export async function getMemberForUser(userId: string) {
  return prisma.member.findFirst({
    where: { userId },
    include: {
      primaryCenter: true,
      subscriptions: { where: { status: "ACTIVE" }, include: { plan: true }, orderBy: { startDate: "desc" } },
    },
  });
}

// FB-2/RB-FB-102: sesiones recientes marcadas ATTENDED sin feedback del cliente todavía
// (SelfAssessment kind="post-sesion" con bookingId en structured, ver submitPostSessionFeedback).
export async function getPendingSessionFeedback(memberId: string, timeZone: string) {
  // `session.date` es un día suelto a medianoche local, no un instante: la
  // ventana de 48h se mide sobre el calendario del centro, no sobre UTC.
  const since = zonedNow(timeZone);
  since.setHours(since.getHours() - 48);
  const attended = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED", occurrenceDate: { gte: since } },
    select: {
      id: true,
      occurrenceDate: true,
      session: { select: { name: true, startTime: true, classType: true, trainer: { select: { name: true } } } },
    },
    orderBy: { occurrenceDate: "desc" },
    take: 5,
  });
  if (attended.length === 0) return [];

  const given = await prisma.selfAssessment.findMany({
    where: { memberId, kind: "post-sesion" },
    select: { structured: true },
  });
  const answeredBookingIds = new Set(
    given.map((g) => (g.structured as { bookingId?: string } | null)?.bookingId).filter((id): id is string => !!id)
  );

  return attended
    .filter((b) => !answeredBookingIds.has(b.id))
    .map((b) => ({
      bookingId: b.id,
      sessionName: b.session.name,
      sessionDate: b.occurrenceDate,
      time: b.session.startTime,
      focus: b.session.classType,
      trainerName: b.session.trainer?.name ?? null,
    }));
}

export async function getPendingSessionFeedbackCountForUser(userId: string, timeZone: string) {
  const member = await prisma.member.findFirst({ where: { userId }, select: { id: true } });
  if (!member) return 0;
  return (await getPendingSessionFeedback(member.id, timeZone)).length;
}

// Medias mostradas en "Mi plan": valoración al entrenador (TrainerRating.score,
// 1-10) y autoevaluación (media de energía+RPE de los SelfAssessment "post-sesion").
export async function getMemberRatingSummary(memberId: string) {
  const [trainerAgg, selfRows] = await Promise.all([
    prisma.trainerRating.aggregate({
      where: { memberId, score: { not: null } },
      _avg: { score: true },
      _count: { _all: true },
    }),
    prisma.selfAssessment.findMany({ where: { memberId, kind: "post-sesion" }, select: { structured: true } }),
  ]);

  const selfScores = selfRows
    .map((r) => r.structured as { energy?: number; rpe?: number } | null)
    .filter((s): s is { energy: number; rpe: number } => typeof s?.energy === "number" && typeof s?.rpe === "number")
    .map((s) => (s.energy + s.rpe) / 2);
  const selfAvg = selfScores.length ? selfScores.reduce((a, b) => a + b, 0) / selfScores.length : null;

  return {
    trainerAvg: trainerAgg._avg.score,
    trainerCount: trainerAgg._count._all,
    selfAvg,
    selfCount: selfScores.length,
  };
}

// Ya no hay "el entrenador del socio" (Member.trainerId): para mostrar un
// nombre de referencia en el portal usamos el entrenador de su última sesión
// de EP (asistida o próxima), que es quien lo entrenó/entrenará de verdad.
export async function getLastEpTrainerName(memberId: string): Promise<string | null> {
  const booking = await prisma.booking.findFirst({
    where: {
      memberId,
      status: { in: ["ATTENDED", "BOOKED"] },
      session: { classType: "Personal Training" },
    },
    orderBy: { occurrenceDate: "desc" },
    select: { session: { select: { trainer: { select: { name: true } } } } },
  });
  return booking?.session.trainer?.name ?? null;
}

// Adherencia del hero de "Mi plan": de las sesiones que el socio reservó y ya
// tuvieron lugar en las últimas 4 semanas (asistidas + no-shows), cuántas asistió.
export async function getMemberPlanAdherence(memberId: string, timeZone: string) {
  // Todo se compara contra `session.date`, que es un día suelto a medianoche
  // local: el "hoy" de referencia tiene que ser el del centro, no el del servidor.
  const since = zonedToday(timeZone);
  since.setDate(since.getDate() - 28);
  const weekStart = zonedToday(timeZone);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // lunes de esta semana

  const bookings = await prisma.booking.findMany({
    where: { memberId, status: { in: ["ATTENDED", "NO_SHOW"] }, occurrenceDate: { gte: since } },
    select: { status: true, occurrenceDate: true },
  });

  const committed = bookings.length;
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const pct = committed > 0 ? Math.round((attended / committed) * 100) : null;
  const avgPerWeek = Math.round(committed / 4);

  const weekBookings = bookings.filter((b) => b.occurrenceDate >= weekStart);
  const weekCommitted = weekBookings.length;
  const weekAttended = weekBookings.filter((b) => b.status === "ATTENDED").length;

  // Racha: semanas consecutivas (terminando en la actual) con al menos una sesión asistida.
  const attendedBookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED" },
    select: { occurrenceDate: true },
  });
  const attendedWeeks = new Set(
    attendedBookings.map(({ occurrenceDate }) => {
      const d = new Date(occurrenceDate);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.getTime();
    })
  );
  let streakWeeks = 0;
  const cursor = new Date(weekStart);
  while (attendedWeeks.has(cursor.getTime())) {
    streakWeeks++;
    cursor.setDate(cursor.getDate() - 7);
  }

  return { pct, attended, committed, avgPerWeek, weekAttended, weekCommitted, streakWeeks };
}

export async function getMemberProgress(memberId: string, timeZone: string) {
  const bookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED" },
    select: { occurrenceDate: true },
    orderBy: { occurrenceDate: "asc" },
  });
  const dates = bookings.map((b) => b.occurrenceDate);

  const now = zonedNow(timeZone);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalThisYear = dates.filter((d) => d >= yearStart).length;
  const totalThisMonth = dates.filter((d) => d >= monthStart).length;

  const byMonth = new Map<string, number>();
  for (const d of dates) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  let bestMonthCount = 0;
  let bestMonthLabel = "";
  for (const [key, count] of byMonth) {
    if (count > bestMonthCount) {
      bestMonthCount = count;
      const [y, m] = key.split("-").map(Number);
      bestMonthLabel = new Date(y, m, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    }
  }

  return {
    totalAllTime: dates.length,
    totalThisYear,
    totalThisMonth,
    bestMonthCount,
    bestMonthLabel,
  };
}

export async function getMemberMonthlyActivity(memberId: string, timeZone: string, months = 6) {
  const now = zonedNow(timeZone);
  const since = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

  const bookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED", occurrenceDate: { gte: since } },
    select: { occurrenceDate: true },
  });

  const counts = new Map<string, number>();
  for (const b of bookings) {
    const d = b.occurrenceDate;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const result: { label: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    result.push({ label: d.toLocaleDateString("es-ES", { month: "short" }), count: counts.get(key) ?? 0 });
  }
  return result;
}

export async function getMemberGoals(memberId: string) {
  return prisma.clientGoal.findMany({ where: { memberId, isTemplate: false }, orderBy: { createdAt: "desc" } });
}

export async function getMemberHealthTransparency(memberId: string, orgId: string) {
  const records = await prisma.healthRecord.findMany({
    where: { memberId, status: "ACTIVE" },
    select: { zone: true, type: true },
  });
  if (records.length === 0) return [];

  const rules = await prisma.aptitudeRule.findMany({ where: { orgId } });
  return records
    .filter((r) => r.zone)
    .flatMap((r) => rules.filter((rule) => rule.injuryZone === r.zone))
    .map((r) => ({ blockArea: r.blockArea, light: r.light, adaptation: r.adaptation }));
}

export const BOOKING_WINDOW_DAYS = 7; // RB-RES-002
const MIN_LEAD_MINUTES = 30; // RB-RES-001
const DEFAULT_CANCEL_WINDOW_HOURS = 24;

/**
 * RB-RES-005: horas de antelación mínima para cancelar sin perder la sesión
 * del bono. Configurable por entorno (`CANCELLATION_WINDOW_HOURS`) para poder
 * cambiar esta regla de negocio sin desplegar código; si la variable falta o
 * no es un número válido, cae a 24h por defecto.
 */
function resolveCancelWindowHours(): number {
  const raw = process.env.CANCELLATION_WINDOW_HOURS;
  if (!raw) return DEFAULT_CANCEL_WINDOW_HOURS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_CANCEL_WINDOW_HOURS;
}

export const CANCEL_WINDOW_HOURS = resolveCancelWindowHours();

/**
 * Instante real de comienzo de una sesión: `ClassSession.date` guarda el día a
 * medianoche y la hora vive aparte en `startTime` ("HH:MM"), que es reloj de
 * pared del centro. Todas las reglas de reserva (antelación mínima, ventana de
 * 7 días, "reserva activa") se miden contra este instante, no contra el día
 * suelto — si no, una clase de esta mañana seguiría contando como reserva
 * futura durante todo el día.
 *
 * `setHours` a secas daba la hora del servidor (UTC en producción): una clase
 * de las 09:00 en Madrid salía como las 09:00 UTC, dos horas más tarde de lo
 * real, y todas las cuentas atrás del socio ("faltan X minutos", ventana de
 * cancelación, antelación mínima) iban desplazadas. Con `zonedTimeToInstant`
 * el resultado es un instante absoluto, comparable con `Date.now()` y
 * serializable a la app móvil sin volver a desplazarse.
 */
export function sessionStartsAt(date: Date, startTime: string, timeZone: string) {
  return zonedTimeToInstant(date, startTime, timeZone);
}

/**
 * RB-AGENDA-001: visibilidad segmentada. El socio de grupos ve las clases de
 * grupo (siempre reservables por el cliente, con aforo). El socio de EP ve
 * CUALQUIER franja de EP marcada como autorreservable (`selfBookable`,
 * RB-AGENDA-002), sea cual sea el entrenador que la imparte — ya no hay "el
 * entrenador del socio", el socio puede entrenar con distintos entrenadores
 * según la sesión. El resto de huecos de EP los gestiona el entrenador a
 * mano y no aparecen aquí.
 *
 * RB-AGENDA-003: el centro ya no es un parámetro fijo (el del socio) sino que
 * lo decide cada bono ACTIVE por separado — un socio puede tener un bono de EP
 * en un centro y otro de grupos en otro centro de la misma organización, y ve
 * las clases de cada modalidad en el centro de su bono correspondiente.
 *
 * Las series recurrentes se proyectan igual que en la agenda del entrenador
 * (`expandOccurrences`): antes se filtraba `date` directamente en BD, así que
 * una sesión "cada semana" solo se podía reservar la semana de su fecha base y
 * desaparecía del portal a partir de la siguiente, aunque el entrenador la
 * siguiera viendo en su agenda.
 */
export async function getBookableSessions(
  orgId: string,
  memberId: string,
  activeSubscriptions: { centerId: string; kind: "EP" | "GROUP" }[],
  timeZone: string
) {
  const now = new Date();
  const windowEndMs = now.getTime() + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // El filtro de BD trabaja con días sueltos (medianoche local) y se pasa un
  // día por arriba a propósito: la poda fina la hace el filtro por instante de
  // abajo, que es el que conoce la hora real de cada clase.
  const fromDay = zonedToday(timeZone);
  const toDay = new Date(fromDay);
  toDay.setDate(toDay.getDate() + BOOKING_WINDOW_DAYS + 1);

  // Una condición OR por cada (centro, modalidad) de bono activo, no un único
  // filtro de centro: dos bonos del mismo tipo en el mismo centro producirían
  // una condición repetida, pero Prisma la tolera sin problema.
  const uniqueSubs = new Map(activeSubscriptions.map((s) => [`${s.centerId}:${s.kind}`, s]));
  const orFilters = [...uniqueSubs.values()].map(({ centerId, kind }) =>
    kind === "EP"
      ? { centerId, classType: "Personal Training", selfBookable: true }
      : { centerId, classType: { not: "Personal Training" } }
  );
  if (orFilters.length === 0) return [];

  const sessions = await prisma.classSession.findMany({
    where: {
      orgId,
      status: "SCHEDULED",
      AND: [sessionsInRangeWhere(fromDay, toDay), { OR: orFilters }],
    },
    include: {
      center: { select: { name: true } },
      // `visibleInApp` (D7): si el entrenador no está publicado en la app del
      // socio, su nombre y su foto no acompañan a la sesión.
      trainer: { select: { name: true, image: true, visibleInApp: true } },
      bookings: { select: { id: true, memberId: true, status: true, occurrenceDate: true } },
    },
    orderBy: { date: "asc" },
  });

  return expandOccurrences(sessions, fromDay, toDay)
    .map(({ session: s, date }) => {
      const startsAt = sessionStartsAt(date, s.startTime, timeZone);
      const dayBookings = s.bookings.filter((b) => sameDay(b.occurrenceDate, date));
      const activeBookings = dayBookings.filter(
        (b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW"
      );
      const myBooking = dayBookings.find(
        (b) => b.memberId === memberId && (b.status === "BOOKED" || b.status === "WAITLISTED")
      );
      return {
        // Una serie recurrente comparte `id` entre ocurrencias: la clave de
        // React y la reserva necesitan además el día concreto.
        id: s.id,
        occurrenceDate: formatDateParam(date),
        key: `${s.id}:${formatDateParam(date)}`,
        name: s.name,
        classType: s.classType,
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        bookedCount: activeBookings.length,
        room: s.room,
        trainerName: s.trainer?.visibleInApp ? s.trainer.name : null,
        trainerImage: s.trainer?.visibleInApp ? s.trainer.image : null,
        // Una lista de reserva puede mezclar sesiones de varios centros de la
        // organización (RB-AGENDA-003): la tarjeta necesita indicar cuál.
        centerName: s.center.name,
        startsAt,
        canBook: startsAt.getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60 * 1000,
        canCancelFreely: canCancelWithoutPenalty(startsAt),
        myBookingId: myBooking?.id ?? null,
        myBookingStatus: myBooking?.status ?? null,
      };
    })
    .filter((s) => s.canBook || s.myBookingId)
    // Solo días que el centro opera (`isOperatingDay`): ofrecer un día que la
    // agenda del entrenador no pinta vendía una sesión que luego nadie podía
    // gestionar. Se mantienen, eso sí, las que el socio YA tuviera reservadas
    // de antes, o se quedaría con una reserva que no puede cancelar.
    .filter((s) => isOperatingDay(s.date) || s.myBookingId)
    .filter((s) => s.startsAt.getTime() <= windowEndMs);
}

/** Igualdad de "día suelto" (medianoche local), la codificación de `ClassSession.date`. */
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** `startsAt` es un instante real (ver `sessionStartsAt`), así que basta con `Date.now()`. */
export function canCancelWithoutPenalty(startsAt: Date) {
  return startsAt.getTime() - Date.now() >= CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
}

export type UpcomingBooking = {
  bookingId: string;
  status: "BOOKED" | "WAITLISTED";
  waitlistPosition: number | null;
  sessionId: string;
  /** Día concreto de la serie ("YYYY-MM-DD"): el id de sesión no lo distingue. */
  occurrenceDate: string;
  sessionName: string;
  classType: string;
  startsAt: Date;
  /** Día de la clase en la zona del centro, ya formateado: `startsAt` es un instante
   *  y el servidor corre en UTC, así que formatearlo allí cambiaba de día en las
   *  clases de primera hora. */
  dayLabel: string;
  startTime: string;
  endTime: string;
  centerName: string;
  /** Sala del centro (D7/B3: la app la muestra junto a la hora). */
  room: string | null;
  trainerName: string | null;
  /** Foto del entrenador si su ficha está publicada en la app del socio (D7). */
  trainerImage: string | null;
  /** La clase la anuló el centro: la reserva sigue viva pero ya no ocupa cupo. */
  sessionCancelled: boolean;
  canCancelFreely: boolean;
  /** Aforo de esa ocurrencia ya cubierto. Si es `false` con `status: WAITLISTED`, hay hueco para reclamarlo. */
  full: boolean;
};

/**
 * Etiqueta de día a partir del día suelto de la sesión (medianoche local), no
 * del instante: así no depende de la zona en que se renderice.
 */
function formatDayLabel(day: Date) {
  const label = day.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Todas las reservas vivas del socio para clases que aún no han empezado, sin
 * filtrar por ventana de reserva, centro ni tipo de servicio.
 *
 * El listado de "Reservar clase" solo enseña los próximos 7 días del centro del
 * socio (RB-RES-002/RB-AGENDA-001); esta consulta no tiene ese límite, así que
 * también recoge reservas fuera de esa ventana —una franja de EP que le agendó
 * su entrenador a mano, una clase que el centro movió a otro día— y alimenta
 * "Tus próximas reservas" con la lista completa.
 */
export async function getMemberUpcomingBookings(
  memberId: string,
  timeZone: string,
  db: Pick<typeof prisma, "booking"> = prisma
): Promise<UpcomingBooking[]> {
  const bookings = await db.booking.findMany({
    where: {
      memberId,
      status: { in: ["BOOKED", "WAITLISTED"] },
      occurrenceDate: { gte: zonedToday(timeZone) },
    },
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      occurrenceDate: true,
      session: {
        select: {
          id: true,
          name: true,
          classType: true,
          startTime: true,
          endTime: true,
          status: true,
          capacity: true,
          room: true,
          center: { select: { name: true } },
          trainer: { select: { name: true, image: true, visibleInApp: true } },
          // Necesario para saber si sigue lleno: sin esto no hay forma de
          // decidir si una reserva WAITLISTED ya puede reclamar hueco.
          bookings: { select: { status: true, occurrenceDate: true } },
        },
      },
    },
  });

  const now = Date.now();
  return bookings
    .map((b) => {
      const dayBookings = b.session.bookings.filter((x) => sameDay(x.occurrenceDate, b.occurrenceDate));
      const activeCount = dayBookings.filter((x) => x.status === "BOOKED" || x.status === "ATTENDED" || x.status === "NO_SHOW").length;
      return {
        bookingId: b.id,
        status: b.status as "BOOKED" | "WAITLISTED",
        waitlistPosition: b.waitlistPosition,
        sessionId: b.session.id,
        occurrenceDate: formatDateParam(b.occurrenceDate),
        sessionName: b.session.name,
        classType: b.session.classType,
        startsAt: sessionStartsAt(b.occurrenceDate, b.session.startTime, timeZone),
        dayLabel: formatDayLabel(b.occurrenceDate),
        startTime: b.session.startTime,
        endTime: b.session.endTime,
        centerName: b.session.center.name,
        room: b.session.room,
        trainerName: b.session.trainer?.visibleInApp ? b.session.trainer.name : null,
        trainerImage: b.session.trainer?.visibleInApp ? b.session.trainer.image : null,
        sessionCancelled: b.session.status !== "SCHEDULED",
        full: activeCount >= b.session.capacity,
      };
    })
    .filter((b) => b.startsAt.getTime() > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((b) => ({ ...b, canCancelFreely: canCancelWithoutPenalty(b.startsAt) }));
}

/**
 * Reservas de clases que todavía no han empezado y que el centro no ha
 * anulado (a diferencia de una reserva sobre una clase que el centro sí
 * canceló, a la que el socio ya no puede asistir).
 */
export function isLiveBooking(b: Pick<UpcomingBooking, "sessionCancelled">) {
  return !b.sessionCancelled;
}

export type BookingResult =
  | { ok: true; waitlisted: boolean; forfeited?: boolean }
  | { ok: false; error: string; needsTopUp?: boolean };

type MemberForBooking = {
  id: string;
  primaryCenterId: string;
  subscriptions: {
    id: string;
    status: string;
    centerId: string;
    sessionsRemaining: number | null;
    plan: { type: string };
  }[];
};

const SERVICE_LABEL: Record<string, string> = { EP: "entrenamiento personal", GROUP: "grupos reducidos" };

/**
 * Núcleo de la reserva (RB-RES-001/002/006), extraído de la Server Action
 * del portal (`portal/agenda/actions.ts`) para que la API móvil (F0) lo
 * reutilice sin duplicar la lógica de negocio — "no se reescribe el backend"
 * (§11). Las reglas de qué se puede reservar (centro, antelación, ventana,
 * franjas de EP autorreservables) se validan aquí y no solo al construir el
 * listado: la API móvil recibe un `sessionId` del cliente, así que filtrar solo
 * en `getBookableSessions` dejaba la puerta abierta a reservar por id una clase
 * de otro centro, ya empezada o fuera de la ventana de 7 días.
 */
export async function bookSessionForMember(
  member: MemberForBooking,
  sessionId: string,
  /** Día concreto de la serie que se reserva ("YYYY-MM-DD"); por defecto, la fecha base. */
  occurrenceDateParam?: string | null
): Promise<BookingResult> {
  return prisma.$transaction(async (tx) => {
    // Bloquea la fila de la sesión para serializar reservas concurrentes: sin
    // este lock, dos peticiones simultáneas pueden leer el mismo aforo libre y
    // reservar ambas por encima de `capacity` (double-booking).
    await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`;

    const cls = await tx.classSession.findUnique({
      where: { id: sessionId },
      include: {
        bookings: { select: { status: true, occurrenceDate: true } },
        center: { select: { timezone: true } },
      },
    });
    if (!cls || cls.status !== "SCHEDULED") {
      return { ok: false as const, error: "Esta clase ya no está disponible para reservar." };
    }

    // El cliente manda un día suelto; solo se acepta si la serie ocurre de
    // verdad ese día (si no, se podría "reservar" un martes una clase de los
    // jueves y aparecer en un roster inexistente).
    const occurrenceDate = occurrenceDateParam ? parseDateParam(occurrenceDateParam) : cls.date;
    if (!occursOn(cls, occurrenceDate)) {
      return { ok: false as const, error: "Esta clase no se imparte ese día." };
    }

    // Se comprueba también aquí y no solo al listar: la API móvil
    // (api/mobile/v1/portal/agenda/book) entra con un `sessionId` crudo y se
    // salta el listado entero.
    if (!isOperatingDay(occurrenceDate)) {
      return { ok: false as const, error: "El centro no abre ese día: esa clase no admite reservas." };
    }

    const now = new Date();
    // La zona horaria de referencia es SIEMPRE la del centro que imparte la
    // clase, nunca la que llegue del cliente: `resolveTimezone` prioriza la
    // cookie `tz` del navegador (correcto para pintar horas, no para decidir),
    // y con ella el socio desplazaba `startsAt` hasta ~26 h — lo justo para
    // colarse dentro del corte de antelación mínima o para cancelar dentro de
    // la ventana de penalización recuperando igualmente el bono.
    const enforcementTimeZone = cls.center.timezone || DEFAULT_TIMEZONE;
    const startsAt = sessionStartsAt(occurrenceDate, cls.startTime, enforcementTimeZone);
    // RB-RES-001: antelación mínima. RB-RES-002: ventana de 7 días vista.
    if (startsAt.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60 * 1000) {
      return { ok: false as const, error: `Esta clase empieza en menos de ${MIN_LEAD_MINUTES} minutos: ya no admite reservas.` };
    }
    if (startsAt.getTime() - now.getTime() > BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return { ok: false as const, error: `Solo puedes reservar con ${BOOKING_WINDOW_DAYS} días de antelación.` };
    }
    // RB-AGENDA-001/002: de EP, el socio autorreserva cualquier franja marcada
    // como autorreservable, sin importar qué entrenador la imparte — ya no hay
    // "el entrenador del socio" (puede entrenar con distintos entrenadores).
    if (sessionServiceKind(cls.classType) === "EP" && !cls.selfBookable) {
      return { ok: false as const, error: "Esta franja de entrenamiento personal la gestiona tu entrenador." };
    }

    // Aforo del DÍA reservado, no de la serie entera: sin acotar por ocurrencia
    // un grupo semanal se daba por lleno en cuanto se acumulaban reservas de
    // semanas distintas.
    const dayBookings = cls.bookings.filter((b) => sameDay(b.occurrenceDate, occurrenceDate));
    const activeCount = dayBookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW").length;
    const overCapacity = activeCount >= cls.capacity;

    const existing = await tx.booking.findFirst({
      where: { sessionId, memberId: member.id, occurrenceDate, status: { in: ["BOOKED", "WAITLISTED"] } },
    });
    // Decisión de negocio: sin promoción automática de lista de espera. Si ya
    // estabas en espera y se ha liberado un hueco, lo reclamas tú mismo con el
    // mismo botón "Reservar" que vería cualquiera — no hay orden de cola
    // garantizado, es "quien primero llega" igual que una reserva nueva.
    const claimingOwnWaitlistSpot = existing?.status === "WAITLISTED" && !overCapacity;
    if (existing && !claimingOwnWaitlistSpot) {
      return { ok: false as const, error: "Ya tienes una reserva para esta clase." };
    }

    const kind = sessionServiceKind(cls.classType);
    let chargeSubscriptionId: string | null = null;

    // El saldo se relee DENTRO de la transacción. `member.subscriptions` lo
    // carga `getMemberForUser` antes de abrirla, y con esa foto obsoleta dos
    // reservas simultáneas de sesiones DISTINTAS (el lock de arriba solo
    // serializa las de una misma sesión) leían ambas el mismo saldo, descontaban
    // las dos y dejaban el bono en negativo.
    const freshSubscriptions = await tx.subscription.findMany({
      where: { memberId: member.id, status: "ACTIVE" },
      select: { id: true, centerId: true, sessionsRemaining: true, plan: { select: { type: true } } },
    });

    // RB-AGENDA-003: exige también el centro de la clase — un bono de EP en
    // otro centro de la organización no cubre esta sesión, igual que uno de
    // otra modalidad. El mensaje de error es el mismo para ambos casos. Esta
    // comprobación corre siempre, también en lista de espera: es la única
    // frontera que impide reservar por `sessionId` una clase de otra
    // organización o sin bono aplicable (antes de RB-AGENDA-003 la cubría el
    // `cls.centerId !== member.primaryCenterId` de más arriba, que sí corría
    // incondicionalmente).
    const matching = freshSubscriptions.filter(
      (s) => s.centerId === cls.centerId && planServiceKind(s.plan.type) === kind
    );
    if (matching.length === 0) {
      return {
        ok: false as const,
        error: `Tu plan no incluye sesiones de ${SERVICE_LABEL[kind] ?? "este tipo"}.`,
      };
    }

    if (!overCapacity) {
      // Bono ilimitado (sessionsRemaining null): no descuenta saldo.
      const unlimited = matching.find((s) => s.sessionsRemaining == null);
      if (!unlimited) {
        const withBalance = matching
          .filter((s) => (s.sessionsRemaining ?? 0) > 0)
          .sort((a, b) => (a.sessionsRemaining ?? 0) - (b.sessionsRemaining ?? 0))[0];
        if (!withBalance) {
          return {
            ok: false as const,
            needsTopUp: true,
            error: "No te quedan sesiones en tu bono. Renueva tu bono para seguir reservando.",
          };
        }
        chargeSubscriptionId = withBalance.id;
      }
    }

    // Descuento condicional: el `sessionsRemaining > 0` viaja dentro del propio
    // UPDATE, así que es la base de datos —y no una lectura previa— la que
    // decide si queda saldo. Barrera final contra el bono en negativo si dos
    // transacciones concurrentes llegan hasta aquí con el mismo bono. Va ANTES
    // de escribir la reserva para poder abortar sin dejar nada a medias.
    if (chargeSubscriptionId) {
      const charged = await tx.subscription.updateMany({
        where: { id: chargeSubscriptionId, sessionsRemaining: { gt: 0 } },
        data: { sessionsRemaining: { decrement: 1 } },
      });
      if (charged.count === 0) {
        return {
          ok: false as const,
          needsTopUp: true,
          error: "No te quedan sesiones en tu bono. Renueva tu bono para seguir reservando.",
        };
      }
    }

    if (claimingOwnWaitlistSpot) {
      await tx.booking.update({
        where: { id: existing!.id },
        data: { status: "BOOKED", waitlistPosition: null, subscriptionId: chargeSubscriptionId },
      });
      return { ok: true as const, waitlisted: false };
    }

    // La posición en lista de espera se numera sobre los que ya esperan, no
    // sobre el aforo: `activeCount` no crece al añadir gente a la lista, así que
    // contarlo con `activeCount - capacity + 1` daba la posición 1 a todos.
    const waitlistedCount = dayBookings.filter((b) => b.status === "WAITLISTED").length;

    await tx.booking.create({
      data: {
        sessionId,
        occurrenceDate,
        memberId: member.id,
        status: overCapacity ? "WAITLISTED" : "BOOKED",
        waitlistPosition: overCapacity ? waitlistedCount + 1 : null,
        subscriptionId: chargeSubscriptionId,
      },
    });

    return { ok: true as const, waitlisted: overCapacity };
  });
}

export async function cancelBookingForMember(memberId: string, bookingId: string): Promise<BookingResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, memberId },
    include: {
      session: {
        select: {
          startTime: true,
          capacity: true,
          orgId: true,
          center: { select: { timezone: true } },
          bookings: { select: { status: true, occurrenceDate: true } },
        },
      },
    },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };

  // Solo se cancela lo que sigue vivo. Sin este filtro, el `bookingId` que
  // recibe la acción (y el endpoint móvil) permitía marcar como CANCELLED una
  // reserva ya asistida y borrar así el histórico de asistencia del socio.
  if (booking.status !== "BOOKED" && booking.status !== "WAITLISTED") {
    return { ok: false, error: "Esta reserva ya no está activa." };
  }
  // Zona horaria del centro, nunca la del cliente (ver `bookSessionForMember`):
  // de ella dependen tanto "la clase ya ha empezado" como la ventana de
  // penalización que decide si se devuelve el bono.
  const startsAt = sessionStartsAt(
    booking.occurrenceDate,
    booking.session.startTime,
    booking.session.center.timezone || DEFAULT_TIMEZONE
  );
  if (startsAt.getTime() <= Date.now()) {
    return { ok: false, error: "Esta clase ya ha empezado: no se puede cancelar." };
  }

  // RB-RES-005/006: al cancelar una reserva que consumió bono, se devuelve la
  // sesión al mismo bono — pero solo si se cancela con la antelación mínima
  // configurada (CANCEL_WINDOW_HOURS). Por debajo de esa ventana la sesión se
  // pierde (queda como empleada), igual que si se hubiera asistido: el socio ya
  // ha visto el aviso correspondiente antes de confirmar. La lista de espera
  // nunca descontó, así que nunca se reembolsa ni le afecta esta ventana.
  const withinPenaltyWindow = booking.status === "BOOKED" && !canCancelWithoutPenalty(startsAt);
  const refundSubscriptionId =
    booking.status === "BOOKED" && booking.subscriptionId && !withinPenaltyWindow ? booking.subscriptionId : null;

  // RB-RES-007: si esta cancelación libera un hueco de una sesión que estaba
  // completa, se avisa por email — se mide ANTES de cancelar (incluye esta
  // misma reserva en el recuento) para no confundir "estaba llena" con
  // "cancelar una clase que ya tenía sitio", que no es una oportunidad real.
  const dayBookings = booking.session.bookings.filter((b) => sameDay(b.occurrenceDate, booking.occurrenceDate));
  const activeCountBefore = dayBookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW").length;
  const wasFull = activeCountBefore >= booking.session.capacity;

  // La cancelación solo se aplica si la reserva SIGUE activa, y la condición
  // viaja dentro del propio UPDATE: comprobar el estado con la lectura de más
  // arriba (fuera de la transacción) permitía que dos cancelaciones simultáneas
  // pasaran las dos y devolvieran el bono por duplicado.
  const cancelled = await prisma.$transaction(async (tx) => {
    const applied = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: ["BOOKED", "WAITLISTED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null },
    });
    if (applied.count === 0) return false;

    if (refundSubscriptionId) {
      await tx.subscription.update({
        where: { id: refundSubscriptionId },
        data: { sessionsRemaining: { increment: 1 } },
      });
    }
    return true;
  });
  if (!cancelled) return { ok: false, error: "Esta reserva ya no está activa." };

  if (booking.status === "BOOKED" && wasFull) {
    void notifySessionVacancy({
      orgId: booking.session.orgId,
      sessionId: booking.sessionId,
      occurrenceDate: booking.occurrenceDate,
      excludeMemberId: memberId,
    });
  }

  return { ok: true, waitlisted: false, forfeited: withinPenaltyWindow };
}
