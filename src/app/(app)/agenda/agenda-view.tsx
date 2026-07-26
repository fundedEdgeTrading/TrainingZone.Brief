"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateParam, parseDateParam } from "@/lib/date-utils";
import {
  START_HOUR,
  END_HOUR,
  ROW_HEIGHT,
  DAY_ABBR,
  MONTHS,
  trainerColor,
  addDays,
  weekdayIdx,
  fmtHHMM,
  snap,
  layoutDay,
  type WeekOccurrence,
} from "./agenda-utils";
import { moveSessionAction } from "./session-actions";
import SessionDialog, { type DialogState } from "./session-dialog";
import { TrainerTooltip } from "./trainer-tooltip";
import { usePointerDrag } from "@/lib/use-pointer-drag";

type Trainer = { id: string; name: string };
type Member = { id: string; firstName: string; lastName: string };

export default function AgendaView({
  weekStartISO,
  centerId,
  occurrences,
  trainers,
  members,
  canEdit,
  currentUserId,
  isDirection,
  centerSwitcher,
}: {
  weekStartISO: string;
  centerId: string;
  occurrences: WeekOccurrence[];
  trainers: Trainer[];
  members: Member[];
  canEdit: boolean;
  currentUserId: string;
  isDirection: boolean;
  centerSwitcher?: React.ReactNode;
}) {
  const router = useRouter();
  const weekStart = useMemo(() => parseDateParam(weekStartISO), [weekStartISO]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayISO = useMemo(() => formatDateParam(new Date()), []);
  const nowMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);

  const [visible, setVisible] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(trainers.map((t) => [t.id, true]))
  );
  // `events` es el estado local editable (necesario para el arrastre optimista).
  // Cuando el servidor manda una nueva prop `occurrences` (tras crear/editar/
  // borrar una sesión y refrescar), la sincronizamos ajustando el estado
  // durante el render, sin useEffect (evita el round-trip extra de un efecto).
  const [events, setEvents] = useState(occurrences);
  const [prevOccurrences, setPrevOccurrences] = useState(occurrences);
  if (occurrences !== prevOccurrences) {
    setPrevOccurrences(occurrences);
    setEvents(occurrences);
  }

  const [miniMonth, setMiniMonth] = useState(weekStartISO.slice(0, 7));
  const [dlg, setDlg] = useState<DialogState | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = (7 - START_HOUR) * ROW_HEIGHT;
  }, []);

  function geom(clientX: number, clientY: number) {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const dayW = r.width / 7;
    let day = Math.floor((clientX - r.left) / dayW);
    day = Math.max(0, Math.min(6, day));
    const min = START_HOUR * 60 + ((clientY - r.top) / ROW_HEIGHT) * 60;
    return { day, min };
  }

  // Un solo gesto activo: mover una sesión existente o pulsar en hueco libre
  // para crear una nueva. En táctil hay que mantener pulsado para arrastrar.
  type Gesture =
    | { kind: "event"; id: string; grabDelta: number; dur: number }
    | { kind: "column"; day: number; min: number };

  const drag = usePointerDrag<Gesture>({
    threshold: 4,
    onActivate: (g) => {
      if (g.kind === "event") setDraggingId(g.id);
    },
    onMove: (gesture, p) => {
      if (gesture.kind !== "event") return;
      const g = geom(p.x, p.y);
      if (!g) return;
      let ns = snap(g.min - gesture.grabDelta, 15);
      ns = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - gesture.dur, ns));
      setEvents((evs) =>
        evs.map((ev) => (ev.id === gesture.id ? { ...ev, dayIndex: g.day, startMin: ns, endMin: ns + gesture.dur } : ev))
      );
    },
    onEnd: (gesture, _p, moved) => {
      setDraggingId(null);
      if (gesture.kind === "column") {
        if (!moved && canEdit) openCreate(gesture.day, gesture.min);
        return;
      }
      if (!moved) {
        openEdit(gesture.id);
        return;
      }
      if (!canEdit) return;
      const ev = events.find((e) => e.id === gesture.id);
      if (!ev) return;
      const date = formatDateParam(addDays(weekStart, ev.dayIndex));
      moveSessionAction({ id: ev.id, centerId, date, startTime: fmtHHMM(ev.startMin), endTime: fmtHHMM(ev.endMin) }).then((res) => {
        if (!res.ok) router.refresh();
      });
    },
    onCancel: () => {
      setDraggingId(null);
      setEvents(occurrences);
    },
  });

  function navigate(newWeekStart: Date) {
    router.push(`/agenda?center=${centerId}&week=${formatDateParam(newWeekStart)}`);
  }

  function openCreate(day: number, minRaw: number) {
    const min = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - 30, snap(minRaw, 30)));
    const dateISO = formatDateParam(addDays(weekStart, day));
    setDlg({
      mode: "create",
      id: null,
      title: "",
      dateISO,
      startHHMM: fmtHHMM(min),
      endHHMM: fmtHHMM(Math.min(END_HOUR * 60, min + 60)),
      type: "personal",
      trainerId: trainers[0]?.id ?? "",
      memberId: null,
      memberQuery: "",
      isTrial: false,
      recurrence: "NONE",
      recEnd: "forever",
      recUntil: formatDateParam(addDays(parseDateParam(dateISO), 12 * 7)),
    });
  }

  function openEdit(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev || !canEdit) return;
    const dateISO = formatDateParam(addDays(weekStart, ev.dayIndex));
    setDlg({
      mode: "edit",
      id: ev.id,
      title: ev.title,
      dateISO,
      startHHMM: fmtHHMM(ev.startMin),
      endHHMM: fmtHHMM(ev.endMin),
      type: ev.type,
      trainerId: ev.trainerId,
      memberId: ev.bookedMemberId,
      memberQuery: "",
      isTrial: ev.isTrial,
      recurrence: ev.isRecurring ? "WEEKLY" : "NONE",
      recEnd: "forever",
      recUntil: formatDateParam(addDays(parseDateParam(dateISO), 12 * 7)),
    });
  }

  const monthLabel = `${MONTHS[weekDays[3].getMonth()]} ${weekDays[3].getFullYear()}`;

  const perDay = useMemo(() => {
    const cols: (WeekOccurrence & { col: number; total: number })[][] = Array.from({ length: 7 }, () => []);
    const visibleEvs = events.filter((e) => visible[e.trainerId] !== false);
    for (let i = 0; i < 7; i++) {
      cols[i] = layoutDay(visibleEvs.filter((e) => e.dayIndex === i));
    }
    return cols;
  }, [events, visible]);

  const gridHeight = (END_HOUR - START_HOUR) * ROW_HEIGHT;
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const trainerName = useMemo(() => Object.fromEntries(trainers.map((t) => [t.id, t.name])), [trainers]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="min-h-[60px] shrink-0 border-b border-brand-border flex flex-wrap items-center gap-2 lg:gap-2.5 px-3 py-2 lg:min-h-[60px] lg:px-6 lg:py-2.5">
        <button
          onClick={() => navigate(parseDateParam(formatDateParam(new Date())))}
          className="h-9 px-4 rounded-control border border-brand-border text-[13px] font-semibold text-brand-text hover:bg-tz-bone hover:border-brand-border-hover transition-colors"
        >
          Hoy
        </button>
        <div className="flex items-center gap-0.5">
          <button
            aria-label="Semana anterior"
            onClick={() => navigate(addDays(weekStart, -7))}
            className="w-[38px] h-[38px] rounded-full text-text-2 text-xl hover:bg-tz-bone transition-colors"
          >
            ‹
          </button>
          <button
            aria-label="Semana siguiente"
            onClick={() => navigate(addDays(weekStart, 7))}
            className="w-[38px] h-[38px] rounded-full text-text-2 text-xl hover:bg-tz-bone transition-colors"
          >
            ›
          </button>
        </div>
        <span className="text-[17px] lg:text-[19px] font-semibold text-brand-text tracking-[-.01em] capitalize">{monthLabel}</span>
        <div className="flex-1" />
        {centerSwitcher}
        <div className="hidden lg:flex h-9 items-center gap-2 px-3.5 rounded-control border border-brand-border text-[13px] font-semibold text-brand-text">
          Semana <span className="text-muted text-[10px]">▾</span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        <aside className="w-full lg:w-[248px] shrink-0 max-h-[38vh] lg:max-h-none border-b lg:border-b-0 lg:border-r border-tz-sand p-3.5 overflow-y-auto">
          {canEdit && (
            <button
              onClick={() => openCreate(weekdayIdx(new Date()), 12 * 60)}
              className="flex items-center justify-center gap-2 w-full h-[46px] rounded-xl bg-tz-black text-tz-bone text-sm font-semibold shadow-card hover:bg-brand-ink-soft transition-colors mb-5"
            >
              <span className="text-xl leading-none font-normal">+</span> Nueva sesión
            </button>
          )}

          <div className="hidden lg:block">
            <MiniCalendar
              miniMonth={miniMonth}
              setMiniMonth={setMiniMonth}
              weekStart={weekStart}
              todayISO={todayISO}
              onPick={(d) => navigate(d)}
            />
          </div>

          <div className="pt-4 pb-1.5 border-t border-tz-sand mt-1">
            <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted mb-2.5">Entrenadores</div>
            <div className="flex flex-col gap-0.5">
              {trainers.map((t) => {
                const color = trainerColor(t.id);
                const isVisible = visible[t.id] !== false;
                return (
                  <div
                    key={t.id}
                    onClick={() => setVisible((v) => ({ ...v, [t.id]: !isVisible }))}
                    className="flex items-center gap-3 py-[7px] px-2 rounded-lg cursor-pointer hover:bg-tz-bone"
                  >
                    <span
                      className="w-[18px] h-[18px] rounded-[5px] shrink-0 flex items-center justify-center text-white text-xs"
                      style={{ border: `2px solid ${color}`, background: isVisible ? color : "transparent" }}
                    >
                      {isVisible ? "✓" : ""}
                    </span>
                    <span className="text-[13px] text-brand-text">{t.name}</span>
                  </div>
                );
              })}
              {trainers.length === 0 && <p className="text-xs text-muted px-2">Sin entrenadores asignables.</p>}
            </div>
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
          <div ref={bodyRef} className="flex-1 overflow-auto min-h-0">
            <div className="min-w-[640px]">
              <div className="flex border-b border-brand-border pr-2.5 sticky top-0 z-[5] bg-white">
                <div className="w-[60px] shrink-0" />
                {weekDays.map((d, i) => {
                  const iso = formatDateParam(d);
                  const isToday = iso === todayISO;
                  return (
                    <div key={i} className="flex-1 text-center py-2 pb-1.5">
                      <div
                        className="text-[11px] font-semibold tracking-[.08em]"
                        style={{ color: isToday ? "var(--color-tz-black)" : "var(--color-muted)" }}
                      >
                        {DAY_ABBR[i]}
                      </div>
                      <div
                        className={isToday ? "mt-0.5 mx-auto w-11 h-11 rounded-full bg-tz-black text-tz-bone text-[23px] font-semibold flex items-center justify-center" : "mt-0.5 h-11 text-[23px] font-medium text-brand-text flex items-center justify-center"}
                      >
                        {d.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex">
              <div className="w-[60px] shrink-0 relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} style={{ height: ROW_HEIGHT }} className="relative">
                    {h !== START_HOUR && (
                      <span className="absolute -top-[7px] right-2 text-[10px] text-muted bg-white px-0.5">{h}:00</span>
                    )}
                  </div>
                ))}
              </div>
              <div
                ref={gridRef}
                className="relative flex flex-1 min-w-0"
                style={{
                  height: gridHeight,
                  background: `repeating-linear-gradient(to bottom, var(--color-tz-sand) 0, var(--color-tz-sand) 1px, transparent 1px, transparent ${ROW_HEIGHT}px)`,
                }}
              >
                {weekDays.map((d, i) => {
                  const iso = formatDateParam(d);
                  const isToday = iso === todayISO;
                  const showNow = isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
                  return (
                    <div
                      key={i}
                      className="flex-1 relative border-l border-tz-sand"
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("[data-event-card]")) return;
                        const g = geom(e.clientX, e.clientY);
                        if (!g) return;
                        drag.start(e, { kind: "column", day: i, min: g.min });
                      }}
                    >
                      {showNow && (
                        <div
                          className="absolute left-0 right-0 z-[4]"
                          style={{ top: ((nowMin - START_HOUR * 60) / 60) * ROW_HEIGHT, height: 2, background: "var(--color-critical)" }}
                        >
                          <span className="absolute -left-[5px] -top-1 w-2.5 h-2.5 rounded-full" style={{ background: "var(--color-critical)" }} />
                        </div>
                      )}
                      {perDay[i].map((ev) => {
                        const top = ((ev.startMin - START_HOUR * 60) / 60) * ROW_HEIGHT;
                        const height = Math.max(20, ((ev.endMin - ev.startMin) / 60) * ROW_HEIGHT - 2);
                        const widthPct = 100 / ev.total;
                        const color = trainerColor(ev.trainerId);
                        return (
                          <TrainerTooltip
                            key={ev.id}
                            name={trainerName[ev.trainerId] ?? "Sin entrenador"}
                            color={color}
                            data-event-card
                            onPointerDown={(e) => {
                              if (!canEdit) return;
                              e.stopPropagation();
                              const g = geom(e.clientX, e.clientY);
                              drag.start(e, {
                                kind: "event",
                                id: ev.id,
                                grabDelta: g ? g.min - ev.startMin : 0,
                                dur: ev.endMin - ev.startMin,
                              });
                            }}
                            className="absolute rounded-md text-white select-none [-webkit-touch-callout:none]"
                            style={{
                              top,
                              height,
                              left: `calc(${ev.col * widthPct}% + 1px)`,
                              width: `calc(${widthPct}% - 3px)`,
                              background: color,
                              boxShadow: draggingId === ev.id ? "0 10px 24px -6px rgba(29,29,28,.45)" : "0 1px 2px rgba(29,29,28,.18)",
                              cursor: canEdit ? (draggingId === ev.id ? "grabbing" : "grab") : "default",
                              zIndex: draggingId === ev.id ? 3 : 2,
                              borderLeft: "3px solid rgba(255,255,255,.35)",
                            }}
                            title={ev.title}
                          >
                            <div className="h-full overflow-hidden" style={{ padding: "3px 7px" }}>
                              <div className="font-semibold text-xs leading-tight truncate">
                                {ev.title}
                                {ev.isRecurring ? " ↻" : ""}
                              </div>
                              <div className="text-[11px] opacity-90 truncate">
                                {fmtHHMM(ev.startMin)} – {fmtHHMM(ev.endMin)}
                                {ev.type === "reduced" ? " · Grupo" : ""}
                              </div>
                            </div>
                          </TrainerTooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {dlg && (
        <SessionDialog
          dlg={dlg}
          setDlg={setDlg}
          onClose={() => setDlg(null)}
          centerId={centerId}
          trainers={trainers}
          members={members}
          currentUserId={currentUserId}
          isDirection={isDirection}
          onDone={() => {
            setDlg(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function MiniCalendar({
  miniMonth,
  setMiniMonth,
  weekStart,
  todayISO,
  onPick,
}: {
  miniMonth: string;
  setMiniMonth: (m: string) => void;
  weekStart: Date;
  todayISO: string;
  onPick: (d: Date) => void;
}) {
  const mm = parseDateParam(`${miniMonth}-01`);
  const label = `${MONTHS[mm.getMonth()]} ${mm.getFullYear()}`;
  const miniStart = (() => {
    const d = new Date(mm);
    const off = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - off);
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const weekEnd = addDays(weekStart, 7);

  function shiftMonth(delta: number) {
    const m = new Date(mm);
    m.setMonth(m.getMonth() + delta);
    setMiniMonth(formatDateParam(m).slice(0, 7));
  }

  return (
    <div className="px-1 pb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-brand-text capitalize">{label}</span>
        <div className="flex gap-0.5">
          <button onClick={() => shiftMonth(-1)} className="w-[26px] h-[26px] rounded-full text-text-2 text-[15px] hover:bg-tz-bone">
            ‹
          </button>
          <button onClick={() => shiftMonth(1)} className="w-[26px] h-[26px] rounded-full text-text-2 text-[15px] hover:bg-tz-bone">
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-faint text-[10px] font-semibold mb-0.5">
        {["L", "M", "X", "J", "V", "S", "D"].map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>
      {Array.from({ length: 6 }, (_, w) => (
        <div key={w} className="grid grid-cols-7">
          {Array.from({ length: 7 }, (_, dd) => {
            const d = addDays(miniStart, w * 7 + dd);
            const iso = formatDateParam(d);
            const inWeek = d >= weekStart && d < weekEnd;
            const isToday = iso === todayISO;
            const inMonth = d.getMonth() === mm.getMonth();
            return (
              <button
                key={dd}
                onClick={() => onPick(d)}
                className="h-7 rounded-full text-xs font-medium flex items-center justify-center"
                style={{
                  color: isToday ? "var(--color-tz-bone)" : inMonth ? "var(--color-tz-black)" : "#bdb3a0",
                  background: isToday ? "var(--color-tz-black)" : inWeek ? "#ece4d6" : "transparent",
                }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
