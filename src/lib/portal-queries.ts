import { prisma } from "@/lib/prisma";
import { buildCompositionView } from "@/lib/composition-view";
import { sessionServiceKind, planServiceKind } from "@/lib/members-queries";
import { zonedNow, zonedToday, zonedTimeToInstant } from "@/lib/date-utils";

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
      trainer: { select: { name: true } },
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
    where: { memberId, status: "ATTENDED", session: { date: { gte: since } } },
    select: {
      id: true,
      session: { select: { name: true, date: true, startTime: true, classType: true, trainer: { select: { name: true } } } },
    },
    orderBy: { session: { date: "desc" } },
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
      sessionDate: b.session.date,
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
    where: { memberId, status: { in: ["ATTENDED", "NO_SHOW"] }, session: { date: { gte: since } } },
    select: { status: true, session: { select: { date: true } } },
  });

  const committed = bookings.length;
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const pct = committed > 0 ? Math.round((attended / committed) * 100) : null;
  const avgPerWeek = Math.round(committed / 4);

  const weekBookings = bookings.filter((b) => b.session.date >= weekStart);
  const weekCommitted = weekBookings.length;
  const weekAttended = weekBookings.filter((b) => b.status === "ATTENDED").length;

  // Racha: semanas consecutivas (terminando en la actual) con al menos una sesión asistida.
  const attendedBookings = await prisma.booking.findMany({
    where: { memberId, status: "ATTENDED" },
    select: { session: { select: { date: true } } },
  });
  const attendedWeeks = new Set(
    attendedBookings.map(({ session }) => {
      const d = new Date(session.date);
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
    select: { session: { select: { date: true } } },
    orderBy: { session: { date: "asc" } },
  });
  const dates = bookings.map((b) => b.session.date);

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
    where: { memberId, status: "ATTENDED", session: { date: { gte: since } } },
    select: { session: { select: { date: true } } },
  });

  const counts = new Map<string, number>();
  for (const b of bookings) {
    const d = b.session.date;
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
const CANCEL_WINDOW_HOURS = 4; // RB-RES-005
export const MAX_ACTIVE_BOOKINGS = 3; // RB-RES-004

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
 * grupo (siempre reservables por el cliente, con aforo). El socio de EP solo
 * ve las franjas de SU entrenador marcadas como autorreservables
 * (`selfBookable`, RB-AGENDA-002) — el resto de huecos de EP los gestiona el
 * entrenador a mano y no aparecen aquí.
 */
export async function getBookableSessions(
  orgId: string,
  centerId: string,
  memberId: string,
  memberContext: { trainerId: string | null; hasGroupService: boolean; hasEpService: boolean },
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

  const sessions = await prisma.classSession.findMany({
    where: {
      orgId,
      centerId,
      status: "SCHEDULED",
      date: { gte: fromDay, lt: toDay },
      OR: [
        ...(memberContext.hasGroupService ? [{ classType: { not: "Personal Training" } }] : []),
        ...(memberContext.hasEpService && memberContext.trainerId
          ? [{ classType: "Personal Training", selfBookable: true, trainerId: memberContext.trainerId }]
          : []),
      ],
    },
    include: {
      trainer: { select: { name: true } },
      bookings: { select: { id: true, memberId: true, status: true } },
    },
    orderBy: { date: "asc" },
  });

  return sessions
    .map((s) => {
      const startsAt = sessionStartsAt(s.date, s.startTime, timeZone);
      const activeBookings = s.bookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW");
      const myBooking = s.bookings.find((b) => b.memberId === memberId && (b.status === "BOOKED" || b.status === "WAITLISTED"));
      return {
        id: s.id,
        name: s.name,
        classType: s.classType,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: s.capacity,
        bookedCount: activeBookings.length,
        trainerName: s.trainer?.name ?? null,
        startsAt,
        canBook: startsAt.getTime() - now.getTime() >= MIN_LEAD_MINUTES * 60 * 1000,
        canCancelFreely: canCancelWithoutPenalty(startsAt),
        myBookingId: myBooking?.id ?? null,
        myBookingStatus: myBooking?.status ?? null,
      };
    })
    .filter((s) => s.canBook || s.myBookingId)
    .filter((s) => s.startsAt.getTime() <= windowEndMs);
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
  trainerName: string | null;
  /** La clase la anuló el centro: la reserva sigue viva pero ya no ocupa cupo. */
  sessionCancelled: boolean;
  canCancelFreely: boolean;
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
 * socio (RB-RES-002/RB-AGENDA-001), mientras que el tope de reservas activas
 * (RB-RES-004) cuenta *todas* sus reservas futuras. Con solo aquel listado, una
 * reserva fuera de esa ventana —una franja de EP que le agendó su entrenador a
 * mano, una clase que el centro movió a otro día— era invisible para el socio y
 * aun así le consumía cupo: veía una sola reserva en pantalla y la app le decía
 * que ya tenía 3. Esta consulta es la que alimenta "Tus próximas reservas", de
 * forma que lo que se cuenta y lo que se ve sean siempre lo mismo.
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
      session: { date: { gte: zonedToday(timeZone) } },
    },
    select: {
      id: true,
      status: true,
      waitlistPosition: true,
      session: {
        select: {
          id: true,
          name: true,
          classType: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          center: { select: { name: true } },
          trainer: { select: { name: true } },
        },
      },
    },
  });

  const now = Date.now();
  return bookings
    .map((b) => ({
      bookingId: b.id,
      status: b.status as "BOOKED" | "WAITLISTED",
      waitlistPosition: b.waitlistPosition,
      sessionId: b.session.id,
      sessionName: b.session.name,
      classType: b.session.classType,
      startsAt: sessionStartsAt(b.session.date, b.session.startTime, timeZone),
      dayLabel: formatDayLabel(b.session.date),
      startTime: b.session.startTime,
      endTime: b.session.endTime,
      centerName: b.session.center.name,
      trainerName: b.session.trainer?.name ?? null,
      sessionCancelled: b.session.status !== "SCHEDULED",
    }))
    .filter((b) => b.startsAt.getTime() > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((b) => ({ ...b, canCancelFreely: canCancelWithoutPenalty(b.startsAt) }));
}

/**
 * Reservas que consumen cupo de RB-RES-004: las de clases que todavía no han
 * empezado y que el centro no ha anulado. Una clase que el centro canceló deja
 * de bloquear cupo (el socio no puede asistir a ella).
 */
export function countsTowardsActiveLimit(b: Pick<UpcomingBooking, "sessionCancelled">) {
  return !b.sessionCancelled;
}

export type BookingResult =
  | { ok: true; waitlisted: boolean }
  | { ok: false; error: string; needsTopUp?: boolean };

type MemberForBooking = {
  id: string;
  primaryCenterId: string;
  trainerId: string | null;
  subscriptions: { id: string; status: string; sessionsRemaining: number | null; plan: { type: string } }[];
};

const SERVICE_LABEL: Record<string, string> = { EP: "entrenamiento personal", GROUP: "grupos reducidos" };

/**
 * Núcleo de la reserva (RB-RES-001/002/004/006), extraído de la Server Action
 * del portal (`portal/agenda/actions.ts`) para que la API móvil (F0) lo
 * reutilice sin duplicar la lógica de negocio — "no se reescribe el backend"
 * (§11). Las reglas de qué se puede reservar (centro, antelación, ventana,
 * franjas de EP autorreservables) se validan aquí y no solo al construir el
 * listado: la API móvil recibe un `sessionId` del cliente, así que filtrar solo
 * en `getBookableSessions` dejaba la puerta abierta a reservar por id una clase
 * de otro centro, ya empezada o fuera de la ventana de 7 días.
 */
export async function bookSessionForMember(member: MemberForBooking, sessionId: string, timeZone: string): Promise<BookingResult> {
  return prisma.$transaction(async (tx) => {
    // Bloquea la fila de la sesión para serializar reservas concurrentes: sin
    // este lock, dos peticiones simultáneas pueden leer el mismo aforo libre y
    // reservar ambas por encima de `capacity` (double-booking).
    await tx.$queryRaw`SELECT id FROM "ClassSession" WHERE id = ${sessionId} FOR UPDATE`;

    const cls = await tx.classSession.findUnique({
      where: { id: sessionId },
      include: { bookings: { select: { status: true } } },
    });
    if (!cls || cls.status !== "SCHEDULED") {
      return { ok: false as const, error: "Esta clase ya no está disponible para reservar." };
    }
    if (cls.centerId !== member.primaryCenterId) {
      return { ok: false as const, error: "Esta clase es de otro centro." };
    }

    const now = new Date();
    const startsAt = sessionStartsAt(cls.date, cls.startTime, timeZone);
    // RB-RES-001: antelación mínima. RB-RES-002: ventana de 7 días vista.
    if (startsAt.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60 * 1000) {
      return { ok: false as const, error: `Esta clase empieza en menos de ${MIN_LEAD_MINUTES} minutos: ya no admite reservas.` };
    }
    if (startsAt.getTime() - now.getTime() > BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return { ok: false as const, error: `Solo puedes reservar con ${BOOKING_WINDOW_DAYS} días de antelación.` };
    }
    // RB-AGENDA-001/002: de EP, el socio solo autorreserva las franjas que su
    // propio entrenador ha marcado como autorreservables.
    if (sessionServiceKind(cls.classType) === "EP" && (!cls.selfBookable || cls.trainerId !== member.trainerId)) {
      return { ok: false as const, error: "Esta franja de entrenamiento personal la gestiona tu entrenador." };
    }

    const existing = await tx.booking.findFirst({
      where: { sessionId, memberId: member.id, status: { in: ["BOOKED", "WAITLISTED"] } },
    });
    if (existing) return { ok: false as const, error: "Ya tienes una reserva para esta clase." };

    const activeCount = cls.bookings.filter((b) => b.status === "BOOKED" || b.status === "ATTENDED" || b.status === "NO_SHOW").length;
    const overCapacity = activeCount >= cls.capacity;

    // RB-RES-004: máximo 3 reservas activas simultáneas. Se cuentan las mismas
    // que el socio ve en "Tus próximas reservas" —clases aún no empezadas y no
    // anuladas por el centro— para que el aviso nunca contradiga la pantalla.
    const upcoming = await getMemberUpcomingBookings(member.id, timeZone, tx);
    const activeBookings = upcoming.filter(countsTowardsActiveLimit).length;
    if (!overCapacity && activeBookings >= MAX_ACTIVE_BOOKINGS) {
      return {
        ok: false as const,
        error: `Ya tienes ${activeBookings} reservas activas (el máximo es ${MAX_ACTIVE_BOOKINGS}): cancela alguna en "Tus próximas reservas" para reservar otra.`,
      };
    }

    const kind = sessionServiceKind(cls.classType);
    let chargeSubscriptionId: string | null = null;

    if (!overCapacity) {
      const matching = member.subscriptions.filter(
        (s) => s.status === "ACTIVE" && planServiceKind(s.plan.type) === kind
      );
      if (matching.length === 0) {
        return {
          ok: false as const,
          error: `Tu plan no incluye sesiones de ${SERVICE_LABEL[kind] ?? "este tipo"}.`,
        };
      }
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

    // La posición en lista de espera se numera sobre los que ya esperan, no
    // sobre el aforo: `activeCount` no crece al añadir gente a la lista, así que
    // contarlo con `activeCount - capacity + 1` daba la posición 1 a todos.
    const waitlistedCount = cls.bookings.filter((b) => b.status === "WAITLISTED").length;

    await tx.booking.create({
      data: {
        sessionId,
        memberId: member.id,
        status: overCapacity ? "WAITLISTED" : "BOOKED",
        waitlistPosition: overCapacity ? waitlistedCount + 1 : null,
        subscriptionId: chargeSubscriptionId,
      },
    });
    if (chargeSubscriptionId) {
      await tx.subscription.update({
        where: { id: chargeSubscriptionId },
        data: { sessionsRemaining: { decrement: 1 } },
      });
    }

    return { ok: true as const, waitlisted: overCapacity };
  });
}

export async function cancelBookingForMember(memberId: string, bookingId: string, timeZone: string): Promise<BookingResult> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, memberId },
    include: { session: { select: { date: true, startTime: true } } },
  });
  if (!booking) return { ok: false, error: "No se ha encontrado esa reserva." };

  // Solo se cancela lo que sigue vivo. Sin este filtro, el `bookingId` que
  // recibe la acción (y el endpoint móvil) permitía marcar como CANCELLED una
  // reserva ya asistida y borrar así el histórico de asistencia del socio.
  if (booking.status !== "BOOKED" && booking.status !== "WAITLISTED") {
    return { ok: false, error: "Esta reserva ya no está activa." };
  }
  if (sessionStartsAt(booking.session.date, booking.session.startTime, timeZone).getTime() <= Date.now()) {
    return { ok: false, error: "Esta clase ya ha empezado: no se puede cancelar." };
  }

  // RB-RES-006: al cancelar una reserva que consumió bono, se devuelve la sesión
  // al mismo bono. La lista de espera nunca descontó, así que no se reembolsa.
  const refundSubscriptionId =
    booking.status === "BOOKED" && booking.subscriptionId ? booking.subscriptionId : null;

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null },
    });
    if (refundSubscriptionId) {
      await tx.subscription.update({
        where: { id: refundSubscriptionId },
        data: { sessionsRemaining: { increment: 1 } },
      });
    }
  });

  return { ok: true, waitlisted: false };
}
