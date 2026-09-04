import { prisma } from "@/lib/prisma";
import { formatDateParam } from "@/lib/date-utils";
import { sessionServiceKind } from "@/lib/members-queries";

/**
 * Calendario mensual de un socio (B5 del handoff y pestaña Calendario de la
 * ficha D3). Se construye solo con `Booking.occurrenceDate`, que ya guarda el
 * día concreto de la serie recurrente: no hay que expandir ocurrencias.
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
  /** Nota media del feedback del entrenador (0-10) si la sesión ya se puntuó. */
  feedbackAvg: number | null;
};

export type MemberCalendarDto = {
  month: string;
  entries: CalendarEntryDto[];
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

/**
 * `includeDebrief` decide si se manda `feedbackAvg` (la media del debrief que
 * el entrenador rellena tras la sesión — técnica, actitud, dolor percibido...
 * confidencial por `canViewSessionDebrief`, rbac.ts). Es `false` por defecto:
 * el calendario del PROPIO socio (`portal/member-calendar`) no debe llevarlo
 * nunca, y hasta ahora lo llevaba sin ningún control. El calendario que
 * consulta el staff sobre la ficha de un socio (`members/[id]/calendar`) sí lo
 * pide explícitamente.
 */
export async function getMemberCalendar(
  memberId: string,
  month: string | null,
  includeDebrief = false
): Promise<MemberCalendarDto> {
  const { start, end, key } = monthRange(month);

  const bookings = await prisma.booking.findMany({
    where: { memberId, occurrenceDate: { gte: start, lt: end } },
    include: {
      session: { select: { name: true, classType: true, startTime: true, endTime: true, center: { select: { name: true } }, trainer: { select: { name: true } } } },
      ...(includeDebrief ? { debrief: true } : {}),
    },
    orderBy: [{ occurrenceDate: "asc" }],
  });

  const entries: CalendarEntryDto[] = bookings.map((b) => ({
    bookingId: b.id,
    day: formatDateParam(b.occurrenceDate),
    sessionName: b.session.name,
    startTime: b.session.startTime,
    endTime: b.session.endTime,
    centerName: b.session.center.name,
    trainerName: b.session.trainer?.name ?? null,
    serviceKind: sessionServiceKind(b.session.classType),
    status: b.status,
    feedbackAvg: "debrief" in b ? debriefAverage(b.debrief) : null,
  }));

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
