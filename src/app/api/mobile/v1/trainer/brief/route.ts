import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatDateParam, zonedToday } from "@/lib/date-utils";
import { resolveTimezoneForCenter } from "@/lib/timezone";
import { expandOccurrences, isSameDay, ownSessionsWhere, sessionsInRangeWhere } from "@/lib/session-occurrences";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// Espejo de src/app/(app)/brief/page.tsx (índice de Session Brief).
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN", "RECEPTION"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const today = zonedToday(await resolveTimezoneForCenter(claims.centerId));
  const endRange = new Date(today);
  endRange.setDate(endRange.getDate() + 3);

  const rows = await prisma.classSession.findMany({
    where: {
      orgId: claims.orgId,
      status: "SCHEDULED",
      ...sessionsInRangeWhere(today, endRange),
      ...(claims.role === "TRAINER" ? ownSessionsWhere(claims.sub) : {}),
    },
    include: {
      center: true,
      trainer: { select: { name: true } },
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
        select: { id: true, occurrenceDate: true },
      },
    },
    orderBy: { date: "asc" },
  });

  const sessions = expandOccurrences(rows, today, endRange);

  return apiOk({
    sessions: sessions.map(({ session: s, date }) => ({
      id: s.id,
      occurrenceDate: formatDateParam(date),
      isToday: date.getTime() === today.getTime(),
      dayLabel: date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric" }),
      startTime: s.startTime,
      name: s.name,
      centerName: s.center.name,
      trainerName: s.trainer?.name ?? null,
      // Reservas de ESE día: una serie recurrente comparte fila entre ocurrencias.
      bookingsCount: s.bookings.filter((b) => isSameDay(b.occurrenceDate, date)).length,
    })),
  });
}
