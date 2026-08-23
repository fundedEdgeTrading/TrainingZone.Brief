"use server";

import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { parseDateParam, zonedNow } from "@/lib/date-utils";
import { resolveTimezone } from "@/lib/timezone";
import { getTrainerPanelData } from "@/lib/trainer-panel-queries";
import { buildAgendaDayView, type TrainerAgendaDayView } from "./agenda-day";

const DAY_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Agenda de un día suelto para las flechas de la tarjeta del panel. Pasar de
 * día es cambiar el contenido de una tarjeta, no de pantalla: con `<Link>` cada
 * flecha era una navegación completa, así que `loading.tsx` tapaba el panel
 * entero con el esqueleto (parecía una recarga) y el scroll saltaba arriba.
 */
export async function loadTrainerAgendaDay(dayParam: string): Promise<TrainerAgendaDayView> {
  const session = await requireRole(["TRAINER", "TRAINER_ADMIN"]);
  const center = session.user.centerId
    ? await prisma.center.findUnique({ where: { id: session.user.centerId }, select: { timezone: true } })
    : null;
  const timezone = await resolveTimezone(center?.timezone);

  const today = zonedNow(timezone);
  today.setHours(0, 0, 0, 0);
  // El día llega del navegador: se valida antes de meterlo en las consultas y,
  // como en la página, nunca se retrocede más allá de hoy.
  const requestedDay = DAY_PARAM.test(dayParam) ? parseDateParam(dayParam) : new Date(today);
  requestedDay.setHours(0, 0, 0, 0);
  const selectedDay = Number.isNaN(requestedDay.getTime()) || requestedDay < today ? new Date(today) : requestedDay;

  const data = await getTrainerPanelData(session.user.orgId, session.user.id, session.user.role, timezone, selectedDay);
  return buildAgendaDayView(data.agendaSessions, selectedDay, today);
}
