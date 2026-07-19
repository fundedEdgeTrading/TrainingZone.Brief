"use client";

import { Calendar, dateFnsLocalizer, View, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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

function occupancyColor(pct: number, cancelled: boolean) {
  if (cancelled) return "#D8CCB8";
  if (pct >= 95) return "#B5482F";
  if (pct >= 70) return "#B98A2E";
  return "#6B7A34";
}

export default function CalendarView({ sessions }: { sessions: SessionEvent[] }) {
  const router = useRouter();
  const [view, setView] = useState<View>(Views.WEEK);

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
    <div className="bg-brand-card border border-brand-border rounded-card p-4 shadow-card tz-fade-up" style={{ height: 700 }}>
      <Calendar
        localizer={localizer}
        culture="es"
        events={events}
        startAccessor="start"
        endAccessor="end"
        view={view}
        onView={setView}
        views={[Views.WEEK, Views.DAY, Views.AGENDA]}
        defaultView={Views.WEEK}
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
  );
}
