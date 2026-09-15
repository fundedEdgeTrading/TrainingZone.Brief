import { prisma } from "@/lib/prisma";
import type { BookingStatus, MemberState, NoShowReason } from "@prisma/client";
import { formatDateParam } from "@/lib/date-utils";
import { toMin } from "@/app/(app)/agenda/agenda-utils";
import { sessionServiceKind } from "@/lib/session-balance";

/**
 * Búsqueda por nombre/email, compartida por el listado y por la base de
 * recuentos de los filtros para que ambos vean exactamente el mismo conjunto.
 */
function memberSearchWhere(q?: string) {
  if (!q) return {};
  return {
    OR: [
      { firstName: { contains: q, mode: "insensitive" as const } },
      { lastName: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
    ],
  };
}

export async function listMembers(
  orgId: string,
  // `skip`/`take`: paginación opcional para el scroll infinito de la app móvil;
  // sin ellos se mantiene el listado completo que consume la web.
  // `states`/`centerIds`: ejes multi-valor de la tabla de socios (dentro de un
  // eje, OR; entre ejes, AND). Mandan sobre `state`/`centerId`, que se
  // conservan porque la API móvil sigue filtrando por un único valor.
  opts: {
    q?: string;
    state?: MemberState;
    states?: MemberState[];
    centerId?: string;
    centerIds?: string[];
    skip?: number;
    take?: number;
  } = {}
) {
  return prisma.member.findMany({
    where: {
      orgId,
      // `centerIds` presente manda SIEMPRE, aunque venga vacío: una lista vacía
      // es "ningún centro visible" (ámbito sin centros, o un `?centerId=` de
      // otro centro que el cruce con el ámbito ha dejado en nada), y tratarla
      // como "sin filtro" devolvía la organización entera — justo lo contrario.
      ...(opts.centerIds !== undefined
        ? { primaryCenterId: { in: opts.centerIds } }
        : { primaryCenterId: opts.centerId || undefined }),
      ...(opts.states?.length ? { state: { in: opts.states } } : { state: opts.state || undefined }),
      ...memberSearchWhere(opts.q),
    },
    include: {
      primaryCenter: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
    orderBy: [{ state: "asc" }, { lastName: "asc" }],
    skip: opts.skip,
    // E12-10: sin tope por defecto. Un `take` fijo aquí descartaba filas de un
    // centro grande SIN AVISAR (320 socios → 20 perdidos en silencio). Quien
    // quiera un tope real lo pide explícitamente (scroll infinito de la app).
    take: opts.take,
  });
}

/**
 * Base de los recuentos por opción de los filtros de socios: cuántas filas
 * quedarían al añadir cada valor manteniendo el resto de filtros. Es lo que
 * evita el callejón sin salida de «filtro → 0 resultados».
 *
 * Va aparte del listado y trae solo los campos que se filtran: el listado ya
 * viene recortado por los ejes activos, así que no serviría para contar lo que
 * pasaría con OTRO valor de esos mismos ejes.
 */
export async function listMemberFilterBase(orgId: string, opts: { q?: string; centerIds?: string[] } = {}) {
  return prisma.member.findMany({
    // `centerIds` es el ámbito de centro de quien mira (center-scope.ts), no un
    // filtro de la interfaz: los recuentos por opción tienen que salir de la
    // misma base que el listado o las cifras no cuadran con las filas.
    where: { orgId, ...(opts.centerIds ? { primaryCenterId: { in: opts.centerIds } } : {}), ...memberSearchWhere(opts.q) },
    select: {
      id: true,
      state: true,
      primaryCenterId: true,
      joinedAt: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { plan: { select: { type: true } } },
      },
    },
  });
}

/**
 * Última asistencia por socio (columna «Última visita»): una sola agregación
 * sobre los socios de la página, no una subconsulta por fila.
 *
 * Cuenta `Booking.status = ATTENDED` sobre `occurrenceDate` — el día concreto de
 * la reserva, no la fecha base de la serie recurrente ni el momento en que se
 * reservó.
 */
export async function lastAttendanceByMember(memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, Date>();
  const rows = await prisma.booking.groupBy({
    by: ["memberId"],
    where: { memberId: { in: memberIds }, status: "ATTENDED" },
    _max: { occurrenceDate: true },
  });
  const out = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.occurrenceDate) out.set(row.memberId, row._max.occurrenceDate);
  }
  return out;
}

// ---------------------------------------------------------------------------
// E14-09 · Frecuencia semanal de visita
// ---------------------------------------------------------------------------

/**
 * La ventana sobre la que se mide la frecuencia semanal, en semanas.
 *
 * Ocho, y va escrita en el encabezado de la columna: **un número de sesiones por
 * semana sin ventana declarada no se puede interpretar**. «1,2 a la semana»
 * significa cosas distintas si es de los últimos quince días o del último año, y
 * quien lo lee no tiene forma de saber cuál.
 *
 * Ocho y no doce, que es la línea base de `retention.ts`, porque las dos cifras
 * hacen trabajos distintos: allí doce semanas son el HÁBITO contra el que se
 * compara una caída, y cuanto más largo mejor; aquí la pregunta es «¿a qué ritmo
 * viene AHORA?», y una ventana larga esconde precisamente lo que se busca — quien
 * dejó de venir hace un mes seguiría leyéndose alto. Ocho semanas son dos meses:
 * cubren dos ciclos de bono mensual, así que una semana de vacaciones no domina
 * la cifra, y a la vez una bajada de tres semanas ya se nota.
 */
export const FREQUENCY_WINDOW_WEEKS = 8;

/** Lo que se pinta en la columna «Ritmo», con la ventana real que lo respalda. */
export type MemberRhythm = {
  /** Sesiones asistidas dentro de la ventana. */
  sessions: number;
  /** Semanas sobre las que se divide de verdad. Puede ser menor que la ventana. */
  weeks: number;
  /** Sesiones por semana, a un decimal. */
  perWeek: number;
};

const WEEK_MS = 7 * 86_400_000;

/**
 * Frecuencia de UN socio. Aritmética pura, para poder probar el caso que la
 * rompe sin sembrar nada.
 *
 * El divisor NO es siempre la ventana: un socio que se dio de alta hace tres
 * días no lleva ocho semanas sin venir, lleva tres días. Dividir sus cero
 * sesiones entre ocho semanas lo pondría el primero en el orden de «menos
 * frecuencia», que es justo la lista de a quién llamar — y llamar a quien acaba
 * de entrar por no haber venido todavía es el tipo de error que hace que nadie
 * vuelva a mirar la columna. Así que se divide entre lo que de verdad lleva
 * dentro, con un suelo de una semana para que los primeros días no disparen el
 * cociente.
 */
export function memberRhythm(
  sessions: number,
  joinedAt: Date,
  now: Date,
  windowWeeks: number = FREQUENCY_WINDOW_WEEKS,
): MemberRhythm {
  const sinceJoined = (now.getTime() - joinedAt.getTime()) / WEEK_MS;
  const weeks = Math.max(1, Math.min(windowWeeks, sinceJoined));
  return {
    sessions,
    weeks: Math.round(weeks * 10) / 10,
    perWeek: Math.round((sessions / weeks) * 10) / 10,
  };
}

/**
 * E14-09 · Ritmo de visita de los socios de la página.
 *
 * Mismo patrón que `lastAttendanceByMember` y por la misma razón (E12-10): UNA
 * agregación sobre los socios de la página, nunca una consulta por fila. El
 * listado pagina en servidor y aquí llega la página, no la tabla entera.
 *
 * Recibe `joinedAt` junto al id porque el divisor depende de él (ver
 * `memberRhythm`) y el listado ya lo tiene cargado: pedirlo otra vez sería una
 * segunda consulta para un dato que está en la mano.
 */
export async function weeklyFrequencyByMember(
  members: { id: string; joinedAt: Date }[],
  now: Date = new Date(),
  windowWeeks: number = FREQUENCY_WINDOW_WEEKS,
) {
  const out = new Map<string, MemberRhythm>();
  if (members.length === 0) return out;

  const from = new Date(now.getTime() - windowWeeks * WEEK_MS);
  const rows = await prisma.booking.groupBy({
    by: ["memberId"],
    where: {
      memberId: { in: members.map((m) => m.id) },
      status: "ATTENDED",
      // Mismo campo que la última visita: `occurrenceDate` es el día concreto
      // de la reserva, no la fecha base de la serie recurrente.
      occurrenceDate: { gte: from, lte: now },
    },
    _count: { _all: true },
  });

  const counts = new Map(rows.map((r) => [r.memberId, r._count._all]));
  for (const member of members) {
    out.set(member.id, memberRhythm(counts.get(member.id) ?? 0, member.joinedAt, now, windowWeeks));
  }
  return out;
}

export async function listActiveMembersForSelect(orgId: string) {
  return prisma.member.findMany({
    where: { orgId, state: "ACTIVE" },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
}

export async function getMemberDetail(orgId: string, memberId: string) {
  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId },
    include: {
      primaryCenter: true,
      subscriptions: { include: { plan: true, center: true }, orderBy: { startDate: "desc" } },
      payments: { orderBy: { date: "desc" }, take: 24 },
      bookings: {
        orderBy: { bookedAt: "desc" },
        take: 30,
        include: { session: true, debrief: true },
      },
      // E10-02: `progressEntries` YA NO viaja en la ficha. Es dato del Art. 9
      // (fotos de progreso y composición corporal) y se lee por el punto único,
      // `getProgressEntriesForMember` en lib/health-access.ts, que aplica la
      // matriz de permisos y deja rastro. Cargarlo aquí se lo daba a recepción.
      invitation: { select: { usedAt: true, expiresAt: true } },
      clientGoals: { orderBy: { createdAt: "desc" } },
    },
  });
  // E10-20: la firma de las URL de foto ya no vive aquí. Con E10-02,
  // `progressEntries` salió de la ficha y se lee por el punto único
  // (`getProgressEntriesForMember`, lib/health-access.ts); la firma se aplica
  // allí, que es por donde pasa ahora tanto la web como la app.
  return member;
}

// Modalidad de servicio y cuentas de saldo: viven en session-balance.ts, que no
// depende de Prisma y sí tiene test unitario. Se reexportan aquí para que las
// llamadas de siempre (`from "@/lib/members-queries"`) sigan valiendo.
export {
  sessionServiceKind,
  getMemberServiceKinds,
  planServiceKind,
  activeBookingSubscriptions,
  bonoUsage,
  effectiveSessionsIncluded,
  getSessionBalances,
} from "@/lib/session-balance";
export type { ServiceKind, BonoUsage, SessionBalance } from "@/lib/session-balance";

// RB-PERFIL-003: catálogo editable de objetivos concretos + asignación a un socio.
export async function listClientGoalTemplates(orgId: string) {
  return prisma.clientGoal.findMany({ where: { orgId, isTemplate: true }, orderBy: { label: "asc" } });
}

export async function addClientGoalTemplate(orgId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica el objetivo." };
  await prisma.clientGoal.create({ data: { orgId, label: label.trim(), isTemplate: true } });
  return { ok: true as const };
}

export async function assignClientGoal(orgId: string, memberId: string, label: string) {
  if (!label.trim()) return { ok: false as const, error: "Indica el objetivo." };
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false as const, error: "Socio no encontrado." };
  await prisma.clientGoal.create({ data: { orgId, memberId, label: label.trim(), isTemplate: false } });
  return { ok: true as const };
}

export async function markClientGoalAchieved(orgId: string, goalId: string) {
  const goal = await prisma.clientGoal.findFirst({ where: { id: goalId, orgId }, select: { id: true } });
  if (!goal) return { ok: false as const, error: "Objetivo no encontrado." };
  await prisma.clientGoal.update({ where: { id: goalId }, data: { achievedAt: new Date() } });
  return { ok: true as const };
}

/**
 * Bitácora del socio, archivadas incluidas. El reparto (hilo, bloque destacado
 * y "archivadas") lo hace `lib/member-notes.ts` sobre esta misma lista: son
 * pocas filas por socio y traerlas de una vez evita tres consultas para pintar
 * una sola sección.
 */
export async function getMemberNotes(orgId: string, memberId: string) {
  return prisma.memberNote.findMany({
    where: { orgId, memberId },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Destaca o deja de destacar una nota. El `orgId` va en el `where` y no en una
 * comprobación previa: un id de otra organización no actualiza nada en vez de
 * confirmar que existe.
 */
export async function setMemberNoteImportant(orgId: string, noteId: string, important: boolean) {
  const { count } = await prisma.memberNote.updateMany({
    where: { id: noteId, orgId },
    data: { important },
  });
  return count > 0;
}

/**
 * Archiva o desarchiva. Archivar NO borra: la fila se queda y sigue saliendo en
 * "Notas archivadas", solo deja de ocupar sitio en el hilo. Desarchivar la
 * devuelve tal cual estaba, con su marca de importante incluida.
 */
export async function setMemberNoteArchived(orgId: string, noteId: string, archived: boolean) {
  const { count } = await prisma.memberNote.updateMany({
    where: { id: noteId, orgId },
    data: { archivedAt: archived ? new Date() : null },
  });
  return count > 0;
}

/**
 * Centros de la organización. `only` acota al ámbito de quien pregunta: sin
 * ello, el filtro «Centro» del listado de socios ofrecía los tres centros a una
 * dirección de un solo centro.
 */
export async function listCentersForOrg(orgId: string, only?: string[] | null) {
  return prisma.center.findMany({
    where: { orgId, ...(only ? { id: { in: only } } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listActivePlansForOrg(orgId: string) {
  return prisma.membershipPlan.findMany({
    where: { orgId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function getMemberAttendanceStats(memberId: string) {
  const bookings = await prisma.booking.findMany({
    where: { memberId },
    include: { session: true },
  });
  const attended = bookings.filter((b) => b.status === "ATTENDED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
  const total = attended + noShow;
  return {
    attended,
    noShow,
    cancelled,
    noShowRate: total ? Math.round((noShow / total) * 100) : 0,
  };
}

// ---------- Calendario de entrenamientos del socio ----------
// Sección "Plan y pagos" de la ficha del socio.
//
// Se consulta BOOKING, no CLASSSESSION: `Booking.occurrenceDate` ya materializa
// el día concreto de cada ocurrencia de una serie recurrente, así que aquí NO
// hace falta proyectar recurrencias (sessionsInRangeWhere/expandOccurrences de
// session-occurrences.ts). Expandirlas sería además incorrecto: pintaría todas
// las ocurrencias futuras de una serie semanal a la que el socio no está
// apuntado. El filtro cae justo sobre el índice Booking[memberId, occurrenceDate].
export type MemberCalendarEvent = {
  bookingId: string;
  sessionId: string;
  /** Día REAL de la ocurrencia ("YYYY-MM-DD"), no la fecha base de la serie. */
  dateISO: string;
  startTime: string; // "HH:mm"
  endTime: string;
  title: string;
  kind: "EP" | "GROUP";
  status: BookingStatus;
  /** RB-RES-009: motivo de la falta y si aquella sesión volvió al bono. */
  noShowReason: NoShowReason | null;
  noShowRefunded: boolean;
  /** La sesión entera está cancelada (distinto de que lo esté esta reserva). */
  sessionCancelled: boolean;
  centerId: string;
  centerName: string;
  trainerId: string | null;
  trainerName: string | null;
  hasDebrief: boolean;
};

export async function getMemberSessionCalendar(
  orgId: string,
  memberId: string,
  from: Date, // medianoche local, inclusive
  to: Date // medianoche local, EXCLUSIVO
): Promise<MemberCalendarEvent[]> {
  const bookings = await prisma.booking.findMany({
    // Aislamiento multi-tenant vía el socio: Booking tampoco tiene orgId.
    where: { memberId, member: { orgId }, occurrenceDate: { gte: from, lt: to } },
    select: {
      id: true,
      sessionId: true,
      status: true,
      noShowReason: true,
      noShowRefunded: true,
      occurrenceDate: true,
      debrief: { select: { id: true } },
      session: {
        select: {
          name: true,
          classType: true,
          startTime: true,
          endTime: true,
          status: true,
          trainerId: true,
          directedByUserId: true,
          center: { select: { id: true, name: true } },
          trainer: { select: { name: true } },
          directedBy: { select: { name: true } },
        },
      },
    },
  });

  return bookings
    .map((b) => ({
      bookingId: b.id,
      sessionId: b.sessionId,
      // `formatDateParam` usa componentes locales: con toISOString() el día se
      // desplazaría en Europe/Madrid (ver date-utils.ts).
      dateISO: formatDateParam(b.occurrenceDate),
      startTime: b.session.startTime,
      endTime: b.session.endTime,
      title: b.session.name,
      kind: sessionServiceKind(b.session.classType),
      status: b.status,
      noShowReason: b.noShowReason,
      noShowRefunded: b.noShowRefunded,
      sessionCancelled: b.session.status === "CANCELLED",
      centerId: b.session.center.id,
      centerName: b.session.center.name,
      // RB-AGENDA-004: manda quien la dirigió de verdad, si consta; el
      // entrenador asignado en la plantilla puede no ser el que dio la sesión.
      trainerId: b.session.directedByUserId ?? b.session.trainerId,
      trainerName: b.session.directedBy?.name ?? b.session.trainer?.name ?? null,
      hasDebrief: b.debrief != null,
    }))
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO) || toMin(a.startTime) - toMin(b.startTime));
}

/**
 * Nombre de un producto sin repetir la modalidad que ya se enseña al lado.
 *
 * Los productos se llaman "Entrenamiento personal · Bono 4 sesiones", y tanto
 * el sidebar del socio como la cabecera de Mi membresía anteponen la modalidad,
 * así que se leía "Entrenamiento personal · Entrenamiento personal · Bono 4
 * sesiones". Se recorta el prefijo cuando coincide; si el producto se llama de
 * otra forma, el nombre sale entero.
 */
export function planNameWithoutService(planName: string, serviceLabel: string | null | undefined): string {
  if (!serviceLabel) return planName;
  const prefix = `${serviceLabel} · `;
  if (planName.toLowerCase().startsWith(prefix.toLowerCase())) {
    return planName.slice(prefix.length).trim() || planName;
  }
  return planName;
}
