"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { formatDateParam, parseDateParam } from "@/lib/date-utils";
import {
  START_HOUR,
  END_HOUR,
  ROW_HEIGHT,
  ROW_HEIGHT_MOBILE,
  VISIBLE_DAYS,
  DAY_ABBR,
  DAY_LETTER,
  DAY_NAME,
  MONTHS,
  trainerColor,
  TRAINER_PALETTE,
  addDays,
  weekdayIdx,
  fmtHHMM,
  snap,
  layoutDay,
  occupancyOf,
  shortMemberName,
  CAPACITY_AMBER,
  CAPACITY_FULL,
  DEFAULT_GROUP_CAPACITY,
  type WeekOccurrence,
} from "./agenda-utils";
import { moveSessionAction } from "./session-actions";
import SessionDialog, { type DialogState } from "./session-dialog";
import { TrainerTooltip } from "./trainer-tooltip";
import TrainerFilter from "./trainer-filter";
import { usePointerDrag } from "@/lib/use-pointer-drag";
import { useIsMobile } from "@/lib/use-media-query";

/**
 * Dirección del último salto de semana y contador A/B para el barrido.
 *
 * `AgendaView` se remonta en cada salto (`key={weekStartISO}` en page.tsx), así
 * que la dirección no cabe en el estado del componente: vive en el módulo, que
 * sí sobrevive al remontaje. Alternar A/B fuerza el retrigger de la animación
 * aunque el navegador colapse dos animaciones homónimas seguidas (misma técnica
 * que wizA/wizB).
 */
let weekSweep: { dir: -1 | 0 | 1; ab: number } = { dir: 0, ab: 0 };

type Trainer = { id: string; name: string };
type Member = { id: string; firstName: string; lastName: string };

export default function AgendaView({
  weekStartISO,
  centerId,
  occurrences,
  trainers,
  members,
  canEdit,
  defaultGroupCapacity,
  currentUserId,
  isDirection,
  initialDayIndex,
  initialMobileWeekView,
  centerSwitcher,
}: {
  weekStartISO: string;
  centerId: string;
  occurrences: WeekOccurrence[];
  trainers: Trainer[];
  members: Member[];
  canEdit: boolean;
  /** Aforo por defecto del centro (Center.defaultGroupCapacity); null si no lo tiene fijado. */
  defaultGroupCapacity: number | null;
  currentUserId: string;
  isDirection: boolean;
  initialDayIndex?: number | null;
  initialMobileWeekView?: boolean;
  centerSwitcher?: React.ReactNode;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const weekStart = useMemo(() => parseDateParam(weekStartISO), [weekStartISO]);
  const weekDays = useMemo(() => Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const todayISO = useMemo(() => formatDateParam(new Date()), []);
  const nowMin = useMemo(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }, []);
  const todayIdxInWeek = useMemo(() => weekDays.findIndex((d) => formatDateParam(d) === todayISO), [weekDays, todayISO]);

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

  // En móvil la rejilla pinta un único día (la semana entera en 360px deja
  // columnas de 45px, ilegibles e imposibles de tocar). Este es el día en
  // pantalla; en escritorio se siguen viendo los siete.
  const [selectedDay, setSelectedDay] = useState(() =>
    initialDayIndex != null ? initialDayIndex : todayIdxInWeek >= 0 ? todayIdxInWeek : 0
  );

  // En móvil se puede alternar entre "un día" (rejilla táctil grande) y
  // "semana" (los 6 días a la vez, como escritorio, para arrastrar sesiones
  // entre días). "expanded" oculta la cabecera de la app y usa toda la
  // pantalla: la semana en miniatura necesita cada pixel posible.
  const [mobileWeekView, setMobileWeekView] = useState(initialMobileWeekView ?? false);
  const [expanded, setExpanded] = useState(false);
  const fullscreen = isMobile && expanded;

  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const [miniMonth, setMiniMonth] = useState(weekStartISO.slice(0, 7));
  const [dlg, setDlg] = useState<DialogState | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const mobileDayOnly = isMobile && !mobileWeekView;
  const rowHeight = mobileDayOnly ? ROW_HEIGHT_MOBILE : ROW_HEIGHT;
  const viewDays = useMemo(
    () => (mobileDayOnly ? [selectedDay] : Array.from({ length: VISIBLE_DAYS }, (_, i) => i)),
    [mobileDayOnly, selectedDay]
  );

  // El efecto de scroll no debe reaccionar a cada arrastre, así que lee los
  // eventos por ref en vez de tenerlos como dependencia.
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  // Al entrar (y al cambiar de día o de layout) colocamos la vista en la
  // primera sesión del día; si no hay, en la hora actual.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const inView = eventsRef.current.filter((e) => !mobileDayOnly || e.dayIndex === selectedDay);
    const firstStart = inView.length ? Math.min(...inView.map((e) => e.startMin)) : null;
    const anchor = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, firstStart ?? nowMin));
    el.scrollTop = Math.max(0, ((anchor - START_HOUR * 60) / 60) * rowHeight - rowHeight * 0.5);
  }, [mobileDayOnly, selectedDay, rowHeight, nowMin]);

  function geom(clientX: number, clientY: number) {
    const el = gridRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const colW = r.width / viewDays.length;
    let col = Math.floor((clientX - r.left) / colW);
    col = Math.max(0, Math.min(viewDays.length - 1, col));
    const min = START_HOUR * 60 + ((clientY - r.top) / rowHeight) * 60;
    return { day: viewDays[col], min };
  }

  // Un solo gesto activo: mover una sesión existente o pulsar en hueco libre
  // para crear una nueva. En táctil hay que mantener pulsado para arrastrar.
  type Gesture =
    | { kind: "event"; uid: string; grabDelta: number; dur: number }
    | { kind: "column"; day: number; min: number };

  const drag = usePointerDrag<Gesture>({
    threshold: 4,
    onActivate: (g) => {
      if (g.kind === "event") setDraggingId(g.uid);
    },
    onMove: (gesture, p) => {
      if (gesture.kind !== "event") return;
      const g = geom(p.x, p.y);
      if (!g) return;
      let ns = snap(g.min - gesture.grabDelta, 15);
      ns = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60 - gesture.dur, ns));
      setEvents((evs) =>
        evs.map((ev) => (ev.uid === gesture.uid ? { ...ev, dayIndex: g.day, startMin: ns, endMin: ns + gesture.dur } : ev))
      );
    },
    onEnd: (gesture, point, moved) => {
      setDraggingId(null);
      if (gesture.kind === "column") {
        if (!moved && canEdit) openCreate(gesture.day, gesture.min, point);
        return;
      }
      if (!moved) {
        openEdit(gesture.uid, point);
        return;
      }
      if (!canEdit) return;
      const ev = events.find((e) => e.uid === gesture.uid);
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

  function navigate(newWeekStart: Date, day?: number) {
    weekSweep = {
      dir: newWeekStart.getTime() === weekStart.getTime() ? 0 : newWeekStart > weekStart ? 1 : -1,
      ab: weekSweep.ab ^ 1,
    };
    const dayParam = day != null ? `&day=${day}` : "";
    // AgendaView se remonta al navegar (cambia `weekStartISO`, ver `key` en
    // page.tsx), así que el modo semana de móvil se reenvía por la URL o se
    // perdía en cada salto de semana con las flechas.
    const viewParam = mobileWeekView ? "&view=week" : "";
    // `scroll: false`: pasar de semana es mover la rejilla, no cambiar de
    // pantalla; sin esto la página saltaba arriba en cada flecha.
    router.push(`/agenda?center=${centerId}&week=${formatDateParam(newWeekStart)}${dayParam}${viewParam}`, {
      scroll: false,
    });
  }

  /** Flechas: en semana completa saltan de semana; en día único, de día en día. */
  function shift(delta: number) {
    if (!mobileDayOnly) {
      navigate(addDays(weekStart, delta * 7));
      return;
    }
    const next = selectedDay + delta;
    if (next >= 0 && next < VISIBLE_DAYS) {
      setSelectedDay(next);
      return;
    }
    navigate(addDays(weekStart, delta * 7), next < 0 ? VISIBLE_DAYS - 1 : 0);
  }

  function goToday() {
    const today = new Date();
    if (todayIdxInWeek >= 0) {
      setSelectedDay(todayIdxInWeek);
      return;
    }
    navigate(parseDateParam(formatDateParam(today)), weekdayIdx(today));
  }

  function openCreate(day: number, minRaw: number, origin?: { x: number; y: number }) {
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
      capacity: defaultGroupCapacity ?? DEFAULT_GROUP_CAPACITY,
      bookedCount: 0,
      // Una franja nueva nace abierta al socio: es lo que espera el entrenador
      // al crearla desde la agenda (RB-AGENDA-001/002).
      selfBookable: true,
      isTrial: false,
      recurrence: "NONE",
      recEnd: "forever",
      recUntil: formatDateParam(addDays(parseDateParam(dateISO), 12 * 7)),
      origin,
    });
  }

  function openEdit(uid: string, origin?: { x: number; y: number }) {
    const ev = events.find((e) => e.uid === uid);
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
      // Solo el EP arrastra "su" socio al diálogo: en un grupo reducido el
      // roster son varias personas y este campo no lo representa.
      memberId: ev.type === "personal" ? ev.bookedMemberId : null,
      capacity: ev.capacity,
      bookedCount: ev.bookedCount,
      selfBookable: ev.selfBookable,
      isTrial: ev.isTrial,
      recurrence: ev.recurrence,
      recEnd: ev.recUntilISO ? "until" : "forever",
      recUntil: ev.recUntilISO ?? formatDateParam(addDays(parseDateParam(dateISO), 12 * 7)),
      origin,
    });
  }

  const labelDay = weekDays[mobileDayOnly ? selectedDay : 2];
  const monthName = MONTHS[labelDay.getMonth()];
  const monthLabel = `${isMobile ? monthName.slice(0, 3) : monthName} ${labelDay.getFullYear()}`;

  const perDay = useMemo(() => {
    const cols: (WeekOccurrence & { col: number; total: number })[][] = Array.from({ length: VISIBLE_DAYS }, () => []);
    const visibleEvs = events.filter((e) => visible[e.trainerId] !== false);
    for (let i = 0; i < VISIBLE_DAYS; i++) {
      cols[i] = layoutDay(visibleEvs.filter((e) => e.dayIndex === i));
    }
    return cols;
  }, [events, visible]);

  const gridHeight = (END_HOUR - START_HOUR) * rowHeight;
  // Barrido direccional al cambiar de semana: entra desde la derecha al avanzar
  // y desde la izquierda al retroceder. En la primera carga no hay dirección y
  // la rejilla se pinta sin barrido.
  const sweepAnimation =
    weekSweep.dir === 0
      ? null
      : `wk${weekSweep.dir > 0 ? "Next" : "Prev"}${weekSweep.ab ? "B" : "A"} .34s var(--ease-out-soft) both`;
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const trainerName = useMemo(() => Object.fromEntries(trainers.map((t) => [t.id, t.name])), [trainers]);

  const content = (
    <div className={fullscreen ? "fixed inset-0 z-50 flex flex-col bg-white" : "flex flex-col h-full min-h-0"}>
      <div className="shrink-0 border-b border-brand-border flex flex-wrap items-center gap-1.5 lg:gap-2.5 px-2.5 py-1.5 lg:min-h-[60px] lg:px-6 lg:py-2.5">
        <button
          onClick={goToday}
          className="h-9 px-3 lg:px-4 rounded-control border border-brand-border text-[13px] font-semibold text-brand-text hover:bg-tz-bone hover:border-brand-border-hover transition-colors"
        >
          Hoy
        </button>
        <div className="flex items-center gap-0.5">
          <button
            aria-label={mobileDayOnly ? "Día anterior" : "Semana anterior"}
            onClick={() => shift(-1)}
            className="w-9 h-9 lg:w-[38px] lg:h-[38px] rounded-full text-text-2 text-xl hover:bg-tz-bone transition-colors"
          >
            ‹
          </button>
          <button
            aria-label={mobileDayOnly ? "Día siguiente" : "Semana siguiente"}
            onClick={() => shift(1)}
            className="w-9 h-9 lg:w-[38px] lg:h-[38px] rounded-full text-text-2 text-xl hover:bg-tz-bone transition-colors"
          >
            ›
          </button>
        </div>
        <span className="text-[15px] lg:text-[19px] font-semibold text-brand-text tracking-[-.01em] capitalize truncate">
          {monthLabel}
        </span>
        <div className="flex-1" />
        <div className="flex lg:hidden items-center gap-0.5 h-9 rounded-control border border-brand-border p-0.5 text-[12px] font-semibold">
          <button
            onClick={() => {
              setMobileWeekView(false);
              setExpanded(false);
            }}
            className={`h-full px-2.5 rounded-[7px] transition-colors ${!mobileWeekView ? "bg-tz-black text-tz-bone" : "text-brand-text"}`}
          >
            Día
          </button>
          <button
            onClick={() => setMobileWeekView(true)}
            className={`h-full px-2.5 rounded-[7px] transition-colors ${mobileWeekView ? "bg-tz-black text-tz-bone" : "text-brand-text"}`}
          >
            Semana
          </button>
        </div>
        {mobileWeekView && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Salir de pantalla completa" : "Ver a pantalla completa"}
            className="lg:hidden w-9 h-9 shrink-0 rounded-control border border-brand-border flex items-center justify-center text-text-2 text-base"
          >
            {expanded ? "⤡" : "⤢"}
          </button>
        )}
        <TrainerFilter
          className="lg:hidden"
          trainers={trainers}
          visible={visible}
          onToggle={(id) => setVisible((v) => ({ ...v, [id]: !(v[id] !== false) }))}
          onSetAll={(value) => setVisible(Object.fromEntries(trainers.map((t) => [t.id, value])))}
        />
        {centerSwitcher}
        <div className="hidden lg:flex h-9 items-center gap-2 px-3.5 rounded-control border border-brand-border text-[13px] font-semibold text-brand-text">
          Semana <span className="text-muted text-[10px]">▾</span>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden lg:block w-[248px] shrink-0 border-r border-tz-sand p-3.5 overflow-y-auto">
          {canEdit && (
            <button
              onClick={() => openCreate(todayIdxInWeek >= 0 ? todayIdxInWeek : 0, 12 * 60)}
              className="flex items-center justify-center gap-2 w-full h-[46px] rounded-xl bg-tz-black text-tz-bone text-sm font-semibold shadow-card hover:bg-brand-ink-soft transition-colors mb-5"
            >
              <span className="text-xl leading-none font-normal">+</span> Nueva sesión
            </button>
          )}

          <MiniCalendar
            miniMonth={miniMonth}
            setMiniMonth={setMiniMonth}
            weekStart={weekStart}
            todayISO={todayISO}
            onPick={(d) => navigate(d)}
          />

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

          <CapacityLegend />
        </aside>

        <section className="flex-1 flex flex-col min-w-0 min-h-0 bg-white">
          {mobileDayOnly && (
            <div className="shrink-0 flex gap-0.5 border-b border-brand-border px-1.5 py-1.5">
              {weekDays.map((d, i) => {
                const isToday = formatDateParam(d) === todayISO;
                const isSel = i === selectedDay;
                const count = perDay[i].length;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(i)}
                    aria-pressed={isSel}
                    aria-label={`${DAY_NAME[i]} ${d.getDate()}`}
                    className={`flex-1 flex flex-col items-center gap-[3px] rounded-xl py-1.5 transition-colors ${
                      isSel ? "bg-tz-black text-tz-bone" : isToday ? "bg-tz-bone text-brand-text" : "text-brand-text"
                    }`}
                  >
                    <span className={`text-[10px] font-bold tracking-[.06em] ${isSel ? "opacity-70" : "text-muted"}`}>
                      {DAY_LETTER[i]}
                    </span>
                    <span className="text-[17px] font-semibold leading-none">{d.getDate()}</span>
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{
                        background: count === 0 ? "transparent" : isSel ? "var(--color-tz-bone)" : "var(--color-tz-black)",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}

          <div className="relative flex-1 min-h-0">
          {mobileDayOnly && perDay[selectedDay].length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-8 text-center text-[13px] text-faint">
              Sin sesiones este día
            </div>
          )}
          <div ref={bodyRef} className="h-full overflow-auto overscroll-contain">
            <div className={mobileDayOnly ? "w-full" : isMobile ? "min-w-[540px]" : "min-w-[640px]"}>
              {!mobileDayOnly && (
                <div className="flex border-b border-brand-border pr-2.5 sticky top-0 z-[5] bg-white">
                  <div className={`${isMobile ? "w-[46px]" : "w-[60px]"} shrink-0`} />
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
                          className={
                            isToday
                              ? `mt-0.5 mx-auto rounded-full bg-tz-black text-tz-bone font-semibold flex items-center justify-center ${isMobile ? "w-8 h-8 text-[15px]" : "w-11 h-11 text-[23px]"}`
                              : `mt-0.5 font-medium text-brand-text flex items-center justify-center ${isMobile ? "h-8 text-[15px]" : "h-11 text-[23px]"}`
                          }
                        >
                          {d.getDate()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex">
              <div className={`${isMobile ? "w-[46px]" : "w-[60px]"} shrink-0 relative`} style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div key={h} style={{ height: rowHeight }} className="relative">
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
                  background: `repeating-linear-gradient(to bottom, var(--color-tz-sand) 0, var(--color-tz-sand) 1px, transparent 1px, transparent ${rowHeight}px)`,
                  ...(sweepAnimation ? { animation: sweepAnimation } : null),
                }}
              >
                {viewDays.map((dayIndex, col) => {
                  const d = weekDays[dayIndex];
                  const iso = formatDateParam(d);
                  const isToday = iso === todayISO;
                  const showNow = isToday && nowMin >= START_HOUR * 60 && nowMin <= END_HOUR * 60;
                  return (
                    <div
                      key={dayIndex}
                      className={`flex-1 relative ${col === 0 && viewDays.length === 1 ? "" : "border-l border-tz-sand"}`}
                      onPointerDown={(e) => {
                        if ((e.target as HTMLElement).closest("[data-event-card]")) return;
                        const g = geom(e.clientX, e.clientY);
                        if (!g) return;
                        drag.start(e, { kind: "column", day: dayIndex, min: g.min });
                      }}
                    >
                      {showNow && (
                        // `pointer-events-none` en toda la marca, no solo en el
                        // anillo: la línea de "ahora" cruza la columna entera a
                        // la hora actual y se pinta por encima de las tarjetas
                        // (z-4), así que se comía el clic de la sesión que le
                        // tocara debajo. Es decoración —no tiene manejadores—,
                        // y el fallo dependía de la hora del día: la sesión que
                        // quedaba tapada cambiaba con el reloj.
                        <div
                          className="pointer-events-none absolute left-0 right-0 z-[4]"
                          style={{ top: ((nowMin - START_HOUR * 60) / 60) * rowHeight, height: 2, background: "var(--color-critical)" }}
                        >
                          <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full" style={{ background: "var(--color-critical)" }} />
                          {/* Anillo que late: marca "ahora" sin robar atención. */}
                          <span
                            aria-hidden="true"
                            className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full"
                            style={{
                              border: "2px solid var(--color-critical)",
                              animation: "tzPulseRing 2.4s ease-out infinite",
                            }}
                          />
                        </div>
                      )}
                      {perDay[dayIndex].map((ev, evIndex) => {
                        const top = ((ev.startMin - START_HOUR * 60) / 60) * rowHeight;
                        const height = Math.max(22, ((ev.endMin - ev.startMin) / 60) * rowHeight - 2);
                        const widthPct = 100 / ev.total;
                        const color = trainerColor(ev.trainerId);
                        const showTrainer = mobileDayOnly && ev.total === 1 && height >= 56;
                        const occ = occupancyOf(ev);
                        // La guarda por tipo no es opcional: en EP la capacidad
                        // es siempre 1, así que una sesión personal reservada
                        // también cumple `occ.full` y se pintaría con la alarma
                        // de aforo lleno de un grupo.
                        const isGroup = ev.type === "reduced";
                        const groupFull = isGroup && occ.full;
                        const closedEp = ev.type === "personal" && ev.bookedCount === 0 && !ev.selfBookable;
                        const edge =
                          isGroup && occ.full
                            ? CAPACITY_FULL
                            : isGroup && occ.lastSeats
                              ? CAPACITY_AMBER
                              : "rgba(255,255,255,.5)";
                        const epLabel =
                          ev.bookedCount > 0
                            ? ev.bookedMemberName
                              ? `· ${shortMemberName(ev.bookedMemberName)}`
                              : "· Reservada"
                            : ev.selfBookable
                              ? "· Libre"
                              : "· Libre, no reservable";
                        return (
                          <TrainerTooltip
                            key={ev.uid}
                            name={trainerName[ev.trainerId] ?? "Sin entrenador"}
                            color={color}
                            data-event-card
                            onPointerDown={(e) => {
                              if (!canEdit) return;
                              e.stopPropagation();
                              const g = geom(e.clientX, e.clientY);
                              drag.start(e, {
                                kind: "event",
                                uid: ev.uid,
                                grabDelta: g ? g.min - ev.startMin : 0,
                                dur: ev.endMin - ev.startMin,
                              });
                            }}
                            className="absolute rounded-md text-white select-none [-webkit-touch-callout:none] transition-[transform,box-shadow] duration-150 ease-out-soft hover:-translate-y-px hover:shadow-hover"
                            style={{
                              top,
                              height,
                              // Cascada de entrada: tope de 6 columnas × 2 eventos
                              // escalonados para no pasar de 0,5 s (plan §0).
                              animation: `tzEventIn .42s var(--ease-spring) ${(
                                0.12 +
                                Math.min(col, 5) * 0.04 +
                                Math.min(evIndex, 1) * 0.03
                              ).toFixed(2)}s both`,
                              left: `calc(${ev.col * widthPct}% + 1px)`,
                              width: `calc(${widthPct}% - 3px)`,
                              background: color,
                              boxShadow:
                                draggingId === ev.uid
                                  ? "0 10px 24px -6px rgba(29,29,28,.45)"
                                  : groupFull
                                    ? `inset 0 0 0 2px ${CAPACITY_FULL}, 0 1px 2px rgba(29,29,28,.18)`
                                    : "0 1px 2px rgba(29,29,28,.18)",
                              cursor: canEdit ? (draggingId === ev.uid ? "grabbing" : "grab") : "default",
                              zIndex: draggingId === ev.uid ? 3 : 2,
                              borderLeft: closedEp
                                ? "3px dashed rgba(255,255,255,.55)"
                                : "3px solid rgba(255,255,255,.35)",
                            }}
                            title={ev.title}
                            aria-label={
                              isGroup
                                ? `${ev.title}, ${ev.bookedCount} de ${ev.capacity} plazas reservadas`
                                : ev.bookedCount > 0
                                  ? `${ev.title}, reservada por ${ev.bookedMemberName ?? "un socio"}`
                                  : `${ev.title}, libre${ev.selfBookable ? "" : ", no reservable por el socio"}`
                            }
                          >
                            {/* El recorte va aquí y no en la tarjeta: el tooltip
                                del entrenador se pinta FUERA de ella y un
                                `overflow: hidden` en la tarjeta lo cortaría. */}
                            <div className="relative h-full overflow-hidden rounded-md" style={{ padding: mobileDayOnly ? "4px 9px" : "3px 7px" }}>
                              {/* Capa de plazas libres: aclara la parte NO
                                  ocupada. `pointer-events-none` para no estorbar
                                  al arrastre ni al tooltip. */}
                              {occ.pct < 100 && (
                                <span
                                  aria-hidden
                                  className="pointer-events-none absolute inset-y-0 right-0"
                                  style={{
                                    left: `${occ.pct}%`,
                                    background: closedEp
                                      ? "repeating-linear-gradient(45deg,rgba(255,255,255,.26) 0 6px,rgba(255,255,255,.08) 6px 12px)"
                                      : "rgba(255,255,255,.26)",
                                    borderLeft: occ.pct > 0 ? `2px solid ${edge}` : "none",
                                  }}
                                />
                              )}
                              <div className="relative">
                                <div className={`font-semibold leading-tight truncate ${mobileDayOnly ? "text-[13px]" : "text-xs"}`}>
                                  {ev.title}
                                  {ev.isRecurring ? " ↻" : ""}
                                </div>
                                <div className="flex items-center gap-[5px] overflow-hidden whitespace-nowrap text-[11px] leading-[1.35]">
                                  <span className="opacity-90 truncate">
                                    {fmtHHMM(ev.startMin)} – {fmtHHMM(ev.endMin)}
                                  </span>
                                  {isGroup ? (
                                    <span
                                      className="shrink-0 rounded-[4px] px-[5px] text-[10px] font-bold leading-[15px]"
                                      style={{
                                        background: occ.full
                                          ? CAPACITY_FULL
                                          : occ.lastSeats
                                            ? CAPACITY_AMBER
                                            : "rgba(0,0,0,.24)",
                                        color: occ.full || occ.lastSeats ? "#2a1a12" : "rgba(255,255,255,.95)",
                                      }}
                                    >
                                      {ev.bookedCount}/{ev.capacity}
                                    </span>
                                  ) : (
                                    <span className="truncate" style={{ opacity: ev.bookedCount > 0 ? 0.9 : 0.78 }}>
                                      {epLabel}
                                    </span>
                                  )}
                                </div>
                                {showTrainer && (
                                  <div className="text-[11px] opacity-80 truncate mt-px">{trainerName[ev.trainerId] ?? "Sin entrenador"}</div>
                                )}
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
          </div>
        </section>
      </div>

      {canEdit && mobileDayOnly && (
        <button
          onClick={() => openCreate(selectedDay, selectedDay === todayIdxInWeek ? nowMin : 9 * 60)}
          aria-label="Nueva sesión"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-tz-black text-tz-bone shadow-pop active:scale-95 transition-transform"
        >
          <span className="text-3xl leading-none font-normal">+</span>
        </button>
      )}

      {dlg && (
        <SessionDialog
          dlg={dlg}
          setDlg={setDlg}
          onClose={() => setDlg(null)}
          centerId={centerId}
          trainers={trainers}
          members={members}
          defaultGroupCapacity={defaultGroupCapacity}
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

  // La tarjeta de la página (`.tz-page`, ver page.tsx) anima su entrada y
  // acaba en `transform: none`, pero el navegador deja como valor computado
  // la matriz identidad en vez de "none": eso la convierte en containing
  // block de los descendientes `position: fixed`, atrapando el overlay de
  // pantalla completa dentro de la tarjeta. Un portal a `document.body` lo
  // esquiva sin depender de que ningún ancestro se quede sin transform.
  return fullscreen ? createPortal(content, document.body) : content;
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
  const weekEnd = addDays(weekStart, VISIBLE_DAYS);

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
        {DAY_LETTER.map((c, i) => (
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
                  color: isToday ? "var(--color-tz-bone)" : inMonth ? "var(--color-tz-black)" : "var(--color-brand-faint)",
                  background: isToday ? "var(--color-tz-black)" : inWeek ? "var(--color-brand-subtle-2)" : "transparent",
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

/**
 * Leyenda de aforo: el relleno de las tarjetas es puramente visual, así que la
 * barra lateral traduce cada estado a palabras. Las muestras usan el primer
 * color de la paleta de entrenadores, que es el fondo sobre el que se leen.
 */
function CapacityLegend() {
  const SWATCH = TRAINER_PALETTE[0];
  const WASH = "rgba(255,255,255,.26)";
  const rows: { label: string; fill: React.CSSProperties; card?: React.CSSProperties }[] = [
    { label: "Plazas ocupadas", fill: { left: "60%", background: WASH, borderLeft: "2px solid rgba(255,255,255,.5)" } },
    { label: "Última plaza libre", fill: { left: "83%", background: WASH, borderLeft: `2px solid ${CAPACITY_AMBER}` } },
    { label: "Completo", fill: { display: "none" }, card: { boxShadow: `inset 0 0 0 2px ${CAPACITY_FULL}` } },
    { label: "EP libre, reservable", fill: { left: 0, background: WASH } },
    {
      label: "EP libre, no reservable",
      fill: {
        left: 0,
        background: "repeating-linear-gradient(45deg,rgba(255,255,255,.26) 0 6px,rgba(255,255,255,.08) 6px 12px)",
      },
      card: { borderLeft: "3px dashed rgba(255,255,255,.55)" },
    },
  ];

  return (
    <div className="pt-4 pb-1.5 border-t border-tz-sand mt-4">
      <div className="text-[11px] font-bold tracking-[.14em] uppercase text-muted mb-2.5">Aforo</div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="relative block h-[18px] w-[34px] shrink-0 overflow-hidden rounded-[4px]"
              style={{ background: SWATCH, ...r.card }}
            >
              <span className="absolute inset-y-0 right-0" style={r.fill} />
            </span>
            <span className="text-[11.5px] text-text-2">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
