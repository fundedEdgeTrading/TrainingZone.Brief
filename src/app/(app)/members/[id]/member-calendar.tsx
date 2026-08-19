"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { fetchMemberSessionsMonth } from "./bonos-actions";
import { MONTHS, DAY_ABBR, addDays, weekdayIdx, trainerColor } from "@/app/(app)/agenda/agenda-utils";
import { formatDateParam, parseDateParam } from "@/lib/date-utils";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { MemberCalendarEvent } from "@/lib/members-queries";

const STATUS_LABEL: Record<string, string> = {
  ATTENDED: "Asistió",
  BOOKED: "Reservada",
  NO_SHOW: "No asistió",
  WAITLISTED: "Lista de espera",
  CANCELLED: "Cancelada",
};

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return formatDateParam(d).slice(0, 7);
}

function isCancelled(ev: MemberCalendarEvent) {
  return ev.status === "CANCELLED" || ev.sessionCancelled;
}

/**
 * Calendario mensual de entrenamientos del socio (solo lectura).
 *
 * Navega de mes SIN tocar la URL a propósito: un cambio de URL re-renderizaría
 * /members/[id] entera y `getHealthRecordsForMember` escribe una fila de
 * AuditLog (HEALTH_RECORD_READ, Art. 9 RGPD) en CADA lectura, así que pasar de
 * mes ensuciaría el registro de accesos a datos de salud con accesos que nadie
 * ha hecho. Además la pestaña activa vive en el useState de tabs.tsx.
 *
 * No reutiliza AgendaView: aquello es la rejilla SEMANAL de todo el centro, con
 * arrastrar y soltar, filtro de entrenadores, diálogo de alta y navegación a
 * /agenda cableada dentro. De agenda-utils.ts sí se reutilizan los helpers
 * puros (MONTHS, DAY_ABBR, addDays, weekdayIdx, trainerColor).
 */
export function MemberSessionsCalendar({
  memberId,
  events,
  loadedFromMonth,
  loadedToMonth,
  initialMonth,
  todayISO,
  minMonth,
  openableCenterIds,
}: {
  memberId: string;
  /** Ventana precargada por el servidor, plana. */
  events: MemberCalendarEvent[];
  loadedFromMonth: string; // "YYYY-MM" inclusivo
  loadedToMonth: string; // "YYYY-MM" EXCLUSIVO
  initialMonth: string; // "YYYY-MM"
  todayISO: string; // calculado en servidor, en la zona del centro
  minMonth: string; // alta del socio: antes de eso no hay nada que paginar
  openableCenterIds: string[];
}) {
  const toast = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [hideCancelled, setHideCancelled] = useState(true);
  const [pending, startTransition] = useTransition();

  // Se siembran TODOS los meses de la ventana, incluidos los vacíos, para poder
  // distinguir "no hay sesiones" de "aún no cargado".
  const [byMonth, setByMonth] = useState<Record<string, MemberCalendarEvent[]>>(() => {
    const seed: Record<string, MemberCalendarEvent[]> = {};
    for (let m = loadedFromMonth; m < loadedToMonth; m = shiftMonth(m, 1)) seed[m] = [];
    for (const ev of events) (seed[monthKey(ev.dateISO)] ??= []).push(ev);
    return seed;
  });

  const openable = useMemo(() => new Set(openableCenterIds), [openableCenterIds]);

  const monthEvents = useMemo(() => byMonth[month] ?? [], [byMonth, month]);

  const byDay = useMemo(() => {
    const map: Record<string, MemberCalendarEvent[]> = {};
    for (const ev of monthEvents) {
      if (hideCancelled && isCancelled(ev)) continue;
      (map[ev.dateISO] ??= []).push(ev);
    }
    return map;
  }, [monthEvents, hideCancelled]);

  const [year, monthIdx] = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return [y, m - 1] as const;
  }, [month]);

  // Rejilla de 6x7. A diferencia de /agenda (VISIBLE_DAYS = 6, sin domingo),
  // una vista de mes pinta los siete días: el histórico puede caer en domingo.
  const gridStart = useMemo(() => {
    const first = new Date(year, monthIdx, 1);
    return addDays(first, -weekdayIdx(first));
  }, [year, monthIdx]);

  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart]
  );

  const counters = useMemo(() => {
    const attended = monthEvents.filter((e) => e.status === "ATTENDED").length;
    const upcoming = monthEvents.filter((e) => e.status === "BOOKED" && e.dateISO > todayISO).length;
    const noShow = monthEvents.filter((e) => e.status === "NO_SHOW").length;
    return { attended, upcoming, noShow };
  }, [monthEvents, todayISO]);

  function goToMonth(next: string) {
    setSelectedDay(null);
    setMonth(next);
    if (byMonth[next]) return;
    startTransition(async () => {
      const res = await fetchMemberSessionsMonth(memberId, next);
      if (res.ok) setByMonth((prev) => ({ ...prev, [next]: res.events }));
      else toast.error(res.error);
    });
  }

  const detail = selectedDay ? (byDay[selectedDay] ?? []) : [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-xs font-semibold text-muted uppercase">Calendario de entrenamientos</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Mes anterior"
            className="rounded-control border border-brand-border bg-white px-2.5 py-1 text-sm text-brand-text hover:border-brand-ink disabled:opacity-40 disabled:pointer-events-none"
            disabled={pending || month <= minMonth}
            onClick={() => goToMonth(shiftMonth(month, -1))}
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-brand-text min-w-[10rem] text-center">
            {MONTHS[monthIdx]} {year}
          </span>
          <button
            type="button"
            aria-label="Mes siguiente"
            className="rounded-control border border-brand-border bg-white px-2.5 py-1 text-sm text-brand-text hover:border-brand-ink disabled:opacity-40 disabled:pointer-events-none"
            disabled={pending}
            onClick={() => goToMonth(shiftMonth(month, 1))}
          >
            ›
          </button>
          <button
            type="button"
            className="rounded-control border border-brand-border bg-white px-3 py-1 text-xs font-semibold text-brand-text hover:border-brand-ink"
            disabled={pending}
            onClick={() => goToMonth(monthKey(todayISO))}
          >
            Hoy
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-brand-muted">
        <span className="tz-nums">
          {counters.attended} asistidas · {counters.upcoming} previstas · {counters.noShow} no-show
        </span>
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={hideCancelled}
            onChange={(e) => setHideCancelled(e.target.checked)}
          />
          Ocultar canceladas
        </label>
      </div>

      <div className={clsx("relative", pending && "opacity-50 pointer-events-none")}>
        <div className="grid grid-cols-7 gap-px bg-tz-sand border border-tz-sand rounded-lg overflow-hidden">
          {DAY_ABBR.map((d) => (
            <div key={d} className="bg-tz-bone px-1 py-1.5 text-center text-[10px] font-bold text-brand-muted">
              {d}
            </div>
          ))}
          {cells.map((day) => {
            const iso = formatDateParam(day);
            const inMonth = day.getMonth() === monthIdx;
            const dayEvents = byDay[iso] ?? [];
            return (
              <button
                type="button"
                key={iso}
                onClick={() => setSelectedDay(dayEvents.length ? iso : null)}
                className={clsx(
                  "bg-white min-h-[74px] p-1 text-left align-top transition-colors",
                  !inMonth && "bg-tz-bone/40",
                  selectedDay === iso && "ring-2 ring-inset ring-tz-black/20",
                  dayEvents.length ? "cursor-pointer hover:bg-tz-linen/40" : "cursor-default"
                )}
              >
                <span
                  className={clsx(
                    "inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] tz-nums",
                    iso === todayISO
                      ? "bg-tz-black text-tz-bone font-bold"
                      : inMonth
                        ? "text-brand-text"
                        : "text-faint"
                  )}
                >
                  {day.getDate()}
                </span>
                <span className="block space-y-0.5 mt-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.bookingId}
                      title={`${ev.startTime} ${ev.title} · ${STATUS_LABEL[ev.status] ?? ev.status}`}
                      className={clsx(
                        "block truncate rounded px-1 py-px text-[10px] leading-tight border-l-2",
                        isCancelled(ev) && "line-through opacity-50",
                        ev.status === "ATTENDED" && "bg-good-bg text-good",
                        ev.status === "NO_SHOW" && "bg-critical-bg text-critical",
                        ev.status === "WAITLISTED" && "bg-warning-bg text-warning-text",
                        ev.status === "BOOKED" && "bg-neutral-bg text-neutral",
                        ev.status === "CANCELLED" && "bg-tz-linen/60 text-text-2"
                      )}
                      style={{ borderLeftColor: ev.trainerId ? trainerColor(ev.trainerId) : "transparent" }}
                    >
                      {ev.startTime} {ev.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="block text-[10px] text-faint">+{dayEvents.length - 3} más</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <div className="border border-tz-linen rounded-lg p-4 bg-tz-bone/40 space-y-2">
          <h5 className="text-xs font-semibold text-muted uppercase">
            {parseDateParam(selectedDay).getDate()} de {MONTHS[parseDateParam(selectedDay).getMonth()]}
          </h5>
          {detail.map((ev) => {
            const label = (
              <>
                <span className="tz-nums text-text-2">
                  {ev.startTime}–{ev.endTime}
                </span>{" "}
                <span className={clsx("font-semibold", isCancelled(ev) && "line-through opacity-60")}>
                  {ev.title}
                </span>
              </>
            );
            return (
              <div key={ev.bookingId} className="flex items-center gap-2 flex-wrap text-sm">
                {openable.has(ev.centerId) ? (
                  <Link
                    href={`/agenda/session/${ev.sessionId}?d=${ev.dateISO}`}
                    className="hover:underline"
                  >
                    {label}
                  </Link>
                ) : (
                  <span>{label}</span>
                )}
                <Badge tone="neutral" dot={false}>
                  {ev.kind === "EP" ? "EP" : "Grupo"}
                </Badge>
                <span className="text-xs text-brand-muted">
                  {ev.centerName}
                  {ev.trainerName ? ` · ${ev.trainerName}` : ""}
                </span>
                <span className="text-xs text-text-2">{STATUS_LABEL[ev.status] ?? ev.status}</span>
                {ev.hasDebrief && (
                  <span className="w-2 h-2 rounded-full bg-good" title="Con debrief del entrenador" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-faint">
        El calendario se construye con el día real de cada reserva. El saldo del bono se descuenta al
        reservar, no al asistir, así que estas sesiones no tienen por qué cuadrar con las restantes.
      </p>
    </div>
  );
}
