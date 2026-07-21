"use client";

import { Calendar, dateFnsLocalizer, View, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { formatDateParam, parseDateParam } from "@/lib/date-utils";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./calendar.css";

const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales,
});

type SessionEvent = {
  id: string;
  name: string;
  classType: string;
  date: string; // ISO
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  trainerName: string | null;
  status: string;
};

function combine(dateISO: string, time: string) {
  const d = new Date(dateISO);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeToMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function useIsMobile() {
  return useSyncExternalStore(
    subscribeToMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}

function occupancyColor(pct: number, cancelled: boolean) {
  if (cancelled) return "#D8CCB8";
  if (pct >= 95) return "#B5482F";
  if (pct >= 70) return "#B98A2E";
  return "#6B7A34";
}

export default function CalendarView({
  sessions,
  focusedDate,
  centerId,
}: {
  sessions: SessionEvent[];
  focusedDate: string;
  centerId: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [userView, setUserView] = useState<View | null>(null);
  const view = userView ?? (isMobile ? Views.DAY : Views.WEEK);

  // El servidor es la única fuente de verdad para la fecha mostrada: cada
  // navegación (Anterior/Hoy/Siguiente, en cualquier vista) recarga la
  // página con la fecha exacta, en vez de confiar en el estado interno no
  // controlado de react-big-calendar (poco fiable al cruzar semanas).
  function handleNavigate(date: Date) {
    const param = formatDateParam(date);
    if (param !== focusedDate) {
      router.push(`/agenda?center=${centerId}&week=${param}`);
    }
  }

  const events = useMemo(
    () =>
      sessions.map((s) => {
        const occupancyPct = s.capacity ? Math.round((s.bookedCount / s.capacity) * 100) : 0;
        return {
          id: s.id,
          title: `${s.name} · ${s.bookedCount}/${s.capacity}${s.waitlistCount ? ` (+${s.waitlistCount})` : ""}`,
          start: combine(s.date, s.startTime),
          end: combine(s.date, s.endTime),
          resource: { ...s, occupancyPct },
        };
      }),
    [sessions]
  );

  return (
    <div className="bg-brand-card border border-brand-border rounded-card p-2.5 sm:p-4 shadow-card tz-fade-up overflow-x-auto">
      {sessions.length === 0 && (
        <p className="text-sm text-brand-muted bg-tz-bone rounded-control px-3 py-2 mb-3">
          No hay sesiones programadas para esta semana.
        </p>
      )}
      <div className={`h-[600px] sm:h-[668px] ${view === Views.WEEK ? "min-w-[640px]" : ""}`}>
        <Calendar
          key={focusedDate}
          localizer={localizer}
          culture="es"
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          onView={setUserView}
          defaultDate={parseDateParam(focusedDate)}
          onNavigate={handleNavigate}
          views={[Views.WEEK, Views.DAY, Views.AGENDA]}
          step={30}
          min={new Date(1970, 0, 1, 6, 0)}
          max={new Date(1970, 0, 1, 22, 0)}
          onSelectEvent={(e) => router.push(`/agenda/session/${e.id}`)}
          eventPropGetter={(event) => ({
            style: {
              backgroundColor: occupancyColor(event.resource.occupancyPct, event.resource.status === "CANCELLED"),
              borderRadius: 6,
              border: "none",
              fontSize: 12,
              textDecoration: event.resource.status === "CANCELLED" ? "line-through" : "none",
            },
          })}
          messages={{
            week: "Semana",
            day: "Día",
            agenda: "Agenda",
            today: "Hoy",
            previous: "Anterior",
            next: "Siguiente",
            noEventsInRange: "Sin sesiones en este rango",
            date: "Fecha",
            time: "Hora",
            event: "Sesión",
          }}
        />
      </div>
    </div>
  );
}
