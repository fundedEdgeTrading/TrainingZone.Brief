import { prisma } from "@/lib/prisma";
import { formatDateParam } from "@/lib/date-utils";
import { sessionServiceKind } from "@/lib/members-queries";

/**
 * Calendario mensual de un socio (B5 del handoff y pestaña Calendario de la
 * ficha D3). Se construye solo con `Booking.occurrenceDate`, que ya guarda el
 * día concreto de la serie recurrente: no hay que expandir ocurrencias.
 */
/**
 * E1-06 (RB-SEG-004): este tipo NO declara `feedbackAvg`, y ese es el punto.
 *
 * `debriefAverage` promedia técnica, actitud, energía, **movilidad** y **dolor
 * invertido**: es un dato de salud, y la matriz de permisos excluye a recepción
 * explícitamente (`canViewHealthData`, rbac.ts). Al ser una clave que el tipo no
 * tiene, añadirla de vuelta a este payload rompe la compilación en vez de
 * filtrar el dato en silencio — que es justo lo que pedía la historia.
 */
export type CalendarEntryDto = {
  bookingId: string;
  day: string;
  sessionName: string;
  startTime: string;
  endTime: string;
  centerName: string;
  trainerName: string | null;
  serviceKind: "EP" | "GROUP";
  status: "BOOKED" | "WAITLISTED" | "ATTENDED" | "NO_SHOW" | "CANCELLED";
};

/** La misma entrada, para quien sí puede ver el debrief. */
export type CalendarEntryWithDebriefDto = CalendarEntryDto & {
  /** Nota media del feedback del entrenador (0-10) si la sesión ya se puntuó. */
  feedbackAvg: number | null;
};

export type MemberCalendarDto<Entry extends CalendarEntryDto = CalendarEntryDto> = {
  month: string;
  entries: Entry[];
  summary: { attended: number; booked: number; noShow: number };
};

/** "YYYY-MM" válido (o el mes en curso) → rango [inicio, fin) en hora local del servidor. */
export function monthRange(month: string | null): { start: Date; end: Date; key: string } {
  const now = new Date();
  const key = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, monthNumber] = key.split("-").map(Number);
  return { start: new Date(year, monthNumber - 1, 1), end: new Date(year, monthNumber, 1), key };
}

/** Media de los ejes puntuados del debrief (el dolor cuenta invertido: menos es mejor). */
export function debriefAverage(debrief: {
  rpe: number | null;
  technique: number | null;
  attitude: number | null;
  energy: number | null;
  mobility: number | null;
  pain: number | null;
  adherence: number | null;
  progress: number | null;
} | null): number | null {
  if (!debrief) return null;
  const positives = [debrief.technique, debrief.attitude, debrief.energy, debrief.mobility, debrief.adherence, debrief.progress];
  const scores = positives.filter((v): v is number => v != null);
  if (debrief.pain != null) scores.push(11 - debrief.pain);
  if (scores.length === 0) return null;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
}

const CALENDAR_SESSION_SELECT = {
  name: true,
  classType: true,
  startTime: true,
  endTime: true,
  center: { select: { name: true } },
  trainer: { select: { name: true } },
} as const;

function summarize<Entry extends CalendarEntryDto>(key: string, entries: Entry[]): MemberCalendarDto<Entry> {
  return {
    month: key,
    entries,
    summary: {
      attended: entries.filter((e) => e.status === "ATTENDED").length,
      booked: entries.filter((e) => e.status === "BOOKED" || e.status === "WAITLISTED").length,
      noShow: entries.filter((e) => e.status === "NO_SHOW").length,
    },
  };
}

/**
 * Calendario mensual SIN nada derivado del debrief.
 *
 * Es el que reciben el propio socio (`portal/member-calendar`) y los roles del
 * staff que no ven datos de salud, recepción entre ellos (E1-06). No es una
 * versión recortada por prudencia: la clave `feedbackAvg` no existe en el
 * payload, así que tampoco llega como `null` —lo que ya diría que el dato
 * existe— ni puede volver por descuido sin romper la compilación.
 */
export async function getMemberCalendar(memberId: string, month: string | null): Promise<MemberCalendarDto> {
  const { start, end, key } = monthRange(month);

  const bookings = await prisma.booking.findMany({
    where: { memberId, occurrenceDate: { gte: start, lt: end } },
    include: { session: { select: CALENDAR_SESSION_SELECT } },
    orderBy: [{ occurrenceDate: "asc" }],
  });

  return summarize(
    key,
    bookings.map((b) => ({
      bookingId: b.id,
      day: formatDateParam(b.occurrenceDate),
      sessionName: b.session.name,
      startTime: b.session.startTime,
      endTime: b.session.endTime,
      centerName: b.session.center.name,
      trainerName: b.session.trainer?.name ?? null,
      serviceKind: sessionServiceKind(b.session.classType),
      status: b.status,
    }))
  );
}

/**
 * El mismo calendario, con la media del debrief que el entrenador rellena tras
 * la sesión. Solo para quien pasa `canViewHealthData` (rbac.ts): el promedio
 * incluye movilidad y dolor.
 */
export async function getMemberCalendarWithDebrief(
  memberId: string,
  month: string | null
): Promise<MemberCalendarDto<CalendarEntryWithDebriefDto>> {
  const { start, end, key } = monthRange(month);

  const bookings = await prisma.booking.findMany({
    where: { memberId, occurrenceDate: { gte: start, lt: end } },
    include: { session: { select: CALENDAR_SESSION_SELECT }, debrief: true },
    orderBy: [{ occurrenceDate: "asc" }],
  });

  return summarize(
    key,
    bookings.map((b) => ({
      bookingId: b.id,
      day: formatDateParam(b.occurrenceDate),
      sessionName: b.session.name,
      startTime: b.session.startTime,
      endTime: b.session.endTime,
      centerName: b.session.center.name,
      trainerName: b.session.trainer?.name ?? null,
      serviceKind: sessionServiceKind(b.session.classType),
      status: b.status,
      feedbackAvg: debriefAverage(b.debrief),
    }))
  );
}
