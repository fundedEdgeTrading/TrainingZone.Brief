import { addDays } from "@/app/(app)/agenda/agenda-utils";
import { formatDateParam, parseDateParam } from "@/lib/date-utils";
import type { TrainerAgendaSession } from "@/lib/trainer-panel-queries";

/**
 * Lo único que cambia al pasar de día en la tarjeta "Agenda de hoy". El
 * servidor lo arma en el primer render y la acción lo devuelve en cada flecha,
 * así que el cliente no vuelve a formatear fechas (ni arriesga desajustes de
 * hidratación por diferencias de ICU entre Node y el navegador).
 */
export type TrainerAgendaDayView = {
  /** Día pintado, en `YYYY-MM-DD` (mismo formato que el parámetro `day`). */
  dayISO: string;
  isToday: boolean;
  title: string;
  meta?: string;
  sessions: TrainerAgendaSession[];
};

/** Título de la tarjeta de agenda según el día navegado, nunca anterior a hoy. */
export function agendaCardTitle(selectedDay: Date, today: Date) {
  const diffDays = Math.round((selectedDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Agenda de hoy";
  if (diffDays === 1) return "Agenda de mañana";
  const label = selectedDay.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  return `Agenda · ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function buildAgendaDayView(
  sessions: TrainerAgendaSession[],
  selectedDay: Date,
  today: Date
): TrainerAgendaDayView {
  const rangeLabel = sessions.length ? `${sessions[0].startTime}–${sessions[sessions.length - 1].endTime}` : null;
  return {
    dayISO: formatDateParam(selectedDay),
    isToday: selectedDay.getTime() === today.getTime(),
    title: agendaCardTitle(selectedDay, today),
    meta: rangeLabel ? `${sessions.length} sesiones · ${rangeLabel}` : undefined,
    sessions,
  };
}

/** Día vecino en `YYYY-MM-DD`: aritmética de calendario, sin husos ni URL. */
export function shiftDayISO(dayISO: string, delta: number) {
  return formatDateParam(addDays(parseDateParam(dayISO), delta));
}
