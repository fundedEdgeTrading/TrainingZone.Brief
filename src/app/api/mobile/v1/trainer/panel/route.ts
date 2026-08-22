import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTrainerPanelData, formatHoursEs } from "@/lib/trainer-panel-queries";
import { formatDateParam, parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezone } from "@/lib/timezone";
import { requireApiRole } from "../../_lib/api-session";
import { apiOk } from "../../_lib/response";

// Espejo de src/app/(app)/trainer/page.tsx ("Mi panel").
export async function GET(req: NextRequest) {
  const auth = await requireApiRole(req, ["TRAINER", "TRAINER_ADMIN"]);
  if (!auth.ok) return auth.response;
  const { claims } = auth;

  const center = claims.centerId
    ? await prisma.center.findUnique({ where: { id: claims.centerId }, select: { name: true, timezone: true } })
    : null;
  const timezone = await resolveTimezone(center?.timezone);

  const now = zonedNow(timezone);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dayParam = req.nextUrl.searchParams.get("day");
  const requestedDay = dayParam ? parseDateParam(dayParam) : new Date(today);
  requestedDay.setHours(0, 0, 0, 0);
  const selectedDay = requestedDay < today ? today : requestedDay;

  const data = await getTrainerPanelData(claims.orgId, claims.sub, claims.role, timezone, selectedDay);

  return apiOk({
    ...data,
    agendaDay: formatDateParam(data.agendaDay),
    epHours: formatHoursEs(data.epHours),
    groupHours: formatHoursEs(data.groupHours),
    monthDelta: formatHoursEs(data.monthDelta),
    centerName: center?.name ?? null,
    todaySessions: data.todaySessions,
  });
}
