"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { MESOCYCLE_REFINE_STEPS, usePacedLoader } from "@/components/ui/brand-loader";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { MesocycleDetail } from "@/lib/mesocycle-queries";
import { MESOCYCLE_STATUS_LABEL, MESOCYCLE_STATUS_TONE } from "../panel";
import {
  approveMesocycleAction,
  archiveMesocycleAction,
  deleteMesocycleExerciseAction,
  refineMesocycleAction,
  updateMesocycleDayAction,
  updateMesocycleExerciseAction,
  updateMesocycleHeaderAction,
  updateMesocyclePhaseAction,
  type MesocycleActionResult,
} from "../actions";

/**
 * Salida de un mesociclo generado por IA.
 *
 * La pantalla ya no es una pila de formularios abiertos: la cabecera en tinta
 * resume lo que decide la revisión (estado, objetivo, semana tipo, lo que NO se
 * programa y la hoja de ruta), el rail de la izquierda lleva a cualquier sesión
 * en un clic y el panel de la derecha se lee como un plan, no como un `<form>`.
 * Nada es un campo hasta que se pulsa, y se conservan todos los campos
 * editables de antes.
 *
 * Sin cambios de datos: el árbol `Mesocycle → Phase → Day → Block → Exercise` y
 * las server actions son los mismos; solo cambia cómo se pinta y se edita.
 */

/**
 * Duración esperada del refinado (una sola llamada al modelo, sin la ficha ni
 * el guardado completo de la generación). Solo reparte los pasos por la barra.
 */
const EXPECTED_REFINE_MS = 55_000;

type Phase = MesocycleDetail["phases"][number];
type Day = Phase["days"][number];
type Exercise = Day["blocks"][number]["exercises"][number];

/** Una petición de refinado ya hecha, recuperada de `aiConversation`. */
export type RefineRequest = { label: string; text: string };

/** Solo una edición abierta a la vez en toda la pantalla. */
type Editing = null | "header" | "day" | "phase" | { exerciseId: string };

type Active = { p: number; d: number };

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function milestones(value: unknown): { week: number; milestone: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { week, milestone } = entry as Record<string, unknown>;
    return typeof week === "number" && typeof milestone === "string" ? [{ week, milestone }] : [];
  });
}

/** Las semanas del mesociclo son las de su última fase. */
function totalWeeks(mesocycle: MesocycleDetail): number {
  return mesocycle.phases.reduce((max, phase) => Math.max(max, phase.weekTo), 0);
}

/**
 * «12 semanas · 3 fases · 3 días/semana». Los tramos sin dato se caen en vez de
 * imprimir un cero: un plan sin semana tipo registrada no entrena 0 días.
 */
function metaOf(mesocycle: MesocycleDetail, memberName?: string): string {
  const weekly = strings(mesocycle.weeklyLayout).length;
  return [
    `${totalWeeks(mesocycle)} semanas`,
    `${mesocycle.phases.length} fases`,
    weekly > 0 ? `${weekly} días/semana` : "",
    memberName ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function dayMinutes(day: Day): number {
  return day.blocks.reduce((total, block) => total + block.durationMin, 0);
}

function doseOf(exercise: Exercise): string {
  return `${exercise.sets} × ${exercise.reps}`;
}

/** Sin carga pautada el hueco no se deja en blanco: el ejercicio va a carga libre. */
function loadLabelOf(exercise: Exercise): string {
  return exercise.load?.trim() || "carga libre";
}

/** `?d=1-0` → `{ p: 1, d: 0 }`, ya acotado al plan que hay. */
function parseActive(value: string | undefined, mesocycle: MesocycleDetail): Active {
  const [rawPhase, rawDay] = (value ?? "").split("-");
  const p = Number(rawPhase);
  const d = Number(rawDay);
  const phase = Number.isInteger(p) ? mesocycle.phases[p] : undefined;
  if (!phase || !Number.isInteger(d) || !phase.days[d]) return { p: 0, d: 0 };
  return { p, d };
}

/** Todas las escrituras del editor comparten el mismo aviso de resultado. */
function useAction() {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<MesocycleActionResult>, success: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        after?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return { pending, run };
}

/* ── Iconos ──────────────────────────────────────────────────────────────────
   Misma familia que `nav-icons.tsx`: viewBox 24, sin relleno, trazo del color
   heredado y extremos redondeados. Los de `descargar` y `organizacion` son
   literalmente los paths de allí. */

function Icon({
  size = 13,
  width = 1.9,
  className,
  children,
}: {
  size?: number;
  width?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={clsx("shrink-0", className)}
    >
      {children}
    </svg>
  );
}

const CheckIcon = (p: { size?: number }) => (
  <Icon size={p.size ?? 14} width={2.4}>
    <path d="M20 6L9 17l-5-5" />
  </Icon>
);
const DownloadIcon = () => (
  <Icon size={15}>
    <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
  </Icon>
);
const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4l10-10-4-4L4 16z" />
  </Icon>
);
const VenueIcon = () => (
  <Icon width={2}>
    <path d="M4 20.5V6.2l8-3 8 3v14.3" />
    <path d="M2.5 20.5h19" />
  </Icon>
);
const ClockIcon = () => (
  <Icon width={2}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon size={14} width={2.2}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Icon>
);
const ChevronIcon = ({ open }: { open: boolean }) => (
  <Icon size={12} width={2.4} className={clsx("transition-transform duration-200 ease-out-soft", !open && "rotate-180")}>
    <path d="M6 15l6-6 6 6" />
  </Icon>
);
const CrossIcon = () => (
  <Icon width={2.6} className="mt-[3px]">
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

/* ── Piezas compartidas ───────────────────────────────────────────────────── */

/** Rótulo de sección con el filete que ocupa el resto de la línea. */
function RuleLabel({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span
        className={clsx(
          "font-bold uppercase shrink-0",
          strong ? "text-[11px] tracking-[.16em] text-brand-text" : "text-[10px] tracking-[.16em] text-brand-faint"
        )}
      >
        {children}
      </span>
      <span className="flex-1 h-px bg-brand-subtle-2" aria-hidden="true" />
    </div>
  );
}

/** Etiqueta de campo sobre tinta: los `Field` del proyecto son para fondo claro. */
const INK_LABEL = "block text-[10.5px] font-bold uppercase tracking-[.12em] text-tz-bone/50 mb-1.5";
const INK_CONTROL =
  "w-full rounded-control border border-tz-bone/25 bg-white/[.06] px-3.5 py-2.5 text-sm text-tz-bone placeholder:text-tz-bone/35 transition-[border-color] duration-200 ease-out-soft focus:border-tz-bone/60 focus:outline-none";
const INK_GHOST_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-control border border-tz-bone/25 px-4 py-2.5 text-[13px] font-semibold text-tz-bone/80 transition-[background-color,border-color,transform] duration-200 ease-out-soft hover:border-tz-bone/50 hover:bg-white/[.06] active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";
const INK_SOLID_BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-control bg-tz-bone px-[18px] py-2.5 text-[13px] font-bold text-tz-black transition-[opacity,transform] duration-200 ease-out-soft hover:opacity-90 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none";

/** El estado va sobre tinta en los dos temas, así que usa siempre la pareja oscura. */
const INK_STATUS: Record<string, string> = {
  warning: "bg-ink-warning-bg text-ink-warning",
  good: "bg-ink-good-bg text-ink-good",
};

/* ── Pantalla ─────────────────────────────────────────────────────────────── */

export function MesocycleEditor({
  memberId,
  memberName,
  mesocycle,
  aiConfigured,
  refineHistory,
  initialDay,
}: {
  memberId: string;
  memberName: string;
  mesocycle: MesocycleDetail;
  aiConfigured: boolean;
  refineHistory: RefineRequest[];
  initialDay?: string;
}) {
  const [active, setActive] = useState<Active>(() => parseActive(initialDay, mesocycle));
  const [editing, setEditing] = useState<Editing>(null);
  const railRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // El plan se rehace entero en cada refinado (`replaceMesocyclePlan`), así que
  // el día que se estaba mirando puede dejar de existir: se vuelve al primero.
  const safe = mesocycle.phases[active.p]?.days[active.d] ? active : { p: 0, d: 0 };
  const phase: Phase | undefined = mesocycle.phases[safe.p];
  const day: Day | undefined = phase?.days[safe.d];

  const go = useCallback((next: Active) => {
    setActive(next);
    setEditing(null);
    // `replaceState` y no `router.push`: cada navegación de servidor revalidaría
    // y en pantallas de salud eso deja una fila de auditoría por cada clic.
    const url = new URL(window.location.href);
    url.searchParams.set("d", `${next.p}-${next.d}`);
    window.history.replaceState(null, "", url);
  }, []);

  // El rail horizontal de móvil arranca con el día activo a la vista. Sin
  // `scrollIntoView` (prohibido en el proyecto): se calcula el `scrollLeft`.
  useEffect(() => {
    const list = railRef.current;
    const item = activeRef.current;
    if (!list || !item || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft = Math.max(0, item.offsetLeft - (list.clientWidth - item.clientWidth) / 2);
  }, [safe.p, safe.d]);

  const sessions = mesocycle.phases.reduce((total, p) => total + p.days.length, 0);

  return (
    <>
      <div className="tz-print-screen flex flex-col gap-5">
        <HeaderCard
          memberId={memberId}
          mesocycle={mesocycle}
          editing={editing === "header"}
          onEdit={() => setEditing("header")}
          onClose={() => setEditing(null)}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[296px_minmax(0,1fr)] gap-5 items-start">
          <nav
            ref={railRef}
            aria-label="Fases y días del mesociclo"
            className="tz-rail-scroll w-full lg:sticky lg:top-0 z-[5] bg-brand-card border border-brand-border rounded-card shadow-card p-[10px] lg:px-2.5 lg:py-3 flex flex-row lg:flex-col gap-2.5 lg:gap-3.5 overflow-x-auto lg:overflow-x-visible"
          >
            <div className="hidden lg:flex items-baseline justify-between px-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-faint">Plan</span>
              <span className="text-[11px] font-semibold text-brand-faint tabular-nums">{sessions} sesiones</span>
            </div>

            {mesocycle.phases.map((p, pi) => (
              <div key={p.id} className="shrink-0 min-w-[230px] lg:min-w-0 flex flex-col gap-[3px]">
                <div className="px-2 pb-1.5 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-[.14em] text-gold">
                    Fase {p.order + 1} · S{p.weekFrom}–{p.weekTo}
                  </span>
                  <span className="text-[12.5px] font-semibold text-brand-text-2 leading-[1.3]">{p.name}</span>
                </div>

                {p.days.map((d, di) => {
                  const on = pi === safe.p && di === safe.d;
                  return (
                    <button
                      key={d.id}
                      ref={on ? activeRef : undefined}
                      type="button"
                      aria-current={on ? "true" : undefined}
                      onClick={() => go({ p: pi, d: di })}
                      className={clsx(
                        "relative w-full min-h-[44px] text-left rounded-xl py-2.5 pl-3.5 pr-3 flex flex-col gap-[3px] transition-[background-color,color] duration-200 ease-out-soft",
                        on ? "bg-tz-black text-tz-bone" : "hover:bg-tz-linen/40"
                      )}
                    >
                      {on && (
                        <span
                          className="tz-gold-bar absolute left-0 top-[9px] bottom-[9px] w-[3px] rounded-r-[3px]"
                          aria-hidden="true"
                        />
                      )}
                      <span className="flex items-center justify-between gap-2">
                        <span className={clsx("text-[13.5px]", on ? "font-bold" : "font-semibold text-brand-text")}>
                          {d.label}
                        </span>
                        <span
                          className={clsx(
                            "text-[10px] font-bold uppercase tracking-[.06em]",
                            on ? "text-apta-gold" : "text-brand-muted-2"
                          )}
                        >
                          {d.venue}
                        </span>
                      </span>
                      <span className={clsx("text-[11.5px] leading-[1.3]", on ? "text-tz-bone/60" : "text-brand-muted")}>
                        {d.focus}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="min-w-0 flex flex-col gap-5">
            {phase && day ? (
              <DayPanel
                // Remonta los borradores locales al cambiar de sesión.
                key={day.id}
                memberId={memberId}
                mesocycleId={mesocycle.id}
                phase={phase}
                day={day}
                safetyCriteria={strings(mesocycle.safetyCriteria)}
                editing={editing}
                setEditing={setEditing}
              />
            ) : (
              <section className="bg-brand-card border border-brand-border rounded-card shadow-card p-7 text-sm text-brand-muted">
                Este mesociclo todavía no tiene ninguna sesión programada.
              </section>
            )}

            <RefineBar
              memberId={memberId}
              mesocycleId={mesocycle.id}
              aiConfigured={aiConfigured}
              history={refineHistory}
            />
          </div>
        </div>
      </div>

      <PrintDocument mesocycle={mesocycle} memberName={memberName} />
    </>
  );
}

/* ── 1. Cabecera ──────────────────────────────────────────────────────────── */

function HeaderCard({
  memberId,
  mesocycle,
  editing,
  onEdit,
  onClose,
}: {
  memberId: string;
  mesocycle: MesocycleDetail;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { pending, run } = useAction();
  const [title, setTitle] = useState(mesocycle.title);
  const [objective, setObjective] = useState(mesocycle.objective);
  const [safety, setSafety] = useState(() => strings(mesocycle.safetyCriteria).join("\n"));

  const safetyCriteria = strings(mesocycle.safetyCriteria);
  const weekly = strings(mesocycle.weeklyLayout);
  const roadmap = milestones(mesocycle.milestones);
  const isDraft = mesocycle.status === "DRAFT";
  const tone = MESOCYCLE_STATUS_TONE[mesocycle.status];

  function cancel() {
    setTitle(mesocycle.title);
    setObjective(mesocycle.objective);
    setSafety(safetyCriteria.join("\n"));
    onClose();
  }

  return (
    <section className="tz-fade-up bg-tz-black text-tz-bone rounded-card px-5 sm:px-7 pt-[26px] pb-6">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        {/* `flex-basis` de 380px y no `flex-1 min-w-0`: con la columna de
            acciones (~500px intrínsecos) en la misma fila, el `h1` se rompía a
            una palabra por línea en vez de dejar que las acciones envuelvan. */}
        <div className="flex-[1_1_380px] min-w-[min(320px,100%)]">
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-pill px-[11px] py-1 text-[11px] font-bold uppercase tracking-[.06em]",
                INK_STATUS[tone] ?? "bg-white/10 text-tz-bone/70"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
              {MESOCYCLE_STATUS_LABEL[mesocycle.status]}
            </span>
            <span className="text-[12.5px] text-tz-bone/50 tracking-[.02em]">{metaOf(mesocycle)}</span>
          </div>

          {editing ? (
            <div className="mt-3.5 flex flex-col gap-3 max-w-[660px]">
              <div>
                <label className={INK_LABEL} htmlFor="meso-title">
                  Título
                </label>
                <input
                  id="meso-title"
                  className={clsx(INK_CONTROL, "font-semibold")}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className={INK_LABEL} htmlFor="meso-objective">
                  Objetivo
                </label>
                <textarea
                  id="meso-objective"
                  rows={3}
                  className={clsx(INK_CONTROL, "resize-y leading-[1.5]")}
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                />
              </div>
              <div>
                <label className={INK_LABEL} htmlFor="meso-safety">
                  Criterios de seguridad
                </label>
                <textarea
                  id="meso-safety"
                  rows={3}
                  className={clsx(INK_CONTROL, "resize-y leading-[1.5]")}
                  value={safety}
                  onChange={(e) => setSafety(e.target.value)}
                />
                <p className="mt-1.5 text-[11.5px] text-tz-bone/45">Lo que NO se puede programar. Uno por línea.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className={INK_SOLID_BUTTON}
                  onClick={() =>
                    run(
                      () =>
                        updateMesocycleHeaderAction(memberId, mesocycle.id, {
                          title,
                          objective,
                          safetyCriteria: safety,
                        }),
                      "Cabecera guardada.",
                      onClose
                    )
                  }
                >
                  Guardar cabecera
                </button>
                <button type="button" disabled={pending} className={INK_GHOST_BUTTON} onClick={cancel}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3.5">
              <h1 className="text-[31px] font-extrabold leading-[1.14] tracking-[-0.02em] max-w-[22ch] text-pretty">
                {mesocycle.title}
              </h1>
              <p className="mt-3 text-[15.5px] leading-[1.55] text-tz-bone/75 max-w-[62ch] text-pretty">
                {mesocycle.objective}
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 max-w-full flex flex-col items-end gap-2.5">
          <div className="flex gap-2 flex-wrap justify-end">
            {isDraft && (
              <button
                type="button"
                disabled={pending}
                className={INK_SOLID_BUTTON}
                onClick={() => run(() => approveMesocycleAction(memberId, mesocycle.id), "Mesociclo aprobado.")}
              >
                <CheckIcon />
                Aprobar mesociclo
              </button>
            )}
            <button type="button" className={INK_GHOST_BUTTON} onClick={() => window.print()}>
              <DownloadIcon />
              PDF para el socio
            </button>
            {mesocycle.status !== "ARCHIVED" && (
              <button
                type="button"
                disabled={pending}
                className={INK_GHOST_BUTTON}
                onClick={() => run(() => archiveMesocycleAction(memberId, mesocycle.id), "Mesociclo archivado.")}
              >
                Archivar
              </button>
            )}
          </div>
          {!editing && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[.1em] text-tz-bone/50 transition-colors duration-200 ease-out-soft hover:text-tz-bone/80"
            >
              <PencilIcon />
              Editar cabecera
            </button>
          )}
        </div>
      </div>

      {isDraft && (
        <p className="mt-[18px] flex gap-[9px] text-[12.5px] leading-[1.5] text-tz-bone/50 max-w-[78ch]">
          <span className="w-1.5 h-1.5 rounded-full bg-ink-warning shrink-0 mt-1.5" aria-hidden="true" />
          Borrador generado por IA: no es un plan válido hasta que lo apruebes. Cualquier cambio posterior devuelve el
          mesociclo a borrador y hay que volver a aprobarlo.
        </p>
      )}

      <div className="mt-[22px] pt-[22px] border-t border-tz-bone/15 grid grid-cols-1 min-[860px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_minmax(0,1fr)] gap-5 min-[860px]:gap-8">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-apta-gold mb-3">Semana tipo</div>
          {weekly.length === 0 ? (
            <p className="text-[13.5px] text-tz-bone/50">Sin semana tipo registrada.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {weekly.map((chip, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-[7px] rounded-lg px-[11px] py-[7px] text-[12.5px] font-semibold bg-white/[.07] whitespace-nowrap"
                >
                  <span className="w-1 h-1 rounded-full bg-apta-gold" aria-hidden="true" />
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* El cambio de jerarquía del rediseño: los criterios de seguridad
            estaban enterrados en un `<textarea>` y son lo primero que hay que
            poder comprobar de un vistazo. */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-ink-critical mb-3">No se programa</div>
          {safetyCriteria.length === 0 ? (
            <p className="text-[13.5px] text-tz-bone/50">Sin criterios de seguridad registrados.</p>
          ) : (
            <ul className="flex flex-col gap-[7px]">
              {safetyCriteria.map((line, i) => (
                <li key={i} className="flex gap-[9px] text-[13.5px] leading-[1.45] text-tz-bone/90">
                  <span className="text-ink-critical">
                    <CrossIcon />
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.16em] text-apta-gold mb-3">Hoja de ruta</div>
          {roadmap.length === 0 ? (
            <p className="text-[13.5px] text-tz-bone/50">Sin hitos registrados.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {roadmap.map((m, i) => (
                <li key={i} className="flex gap-2.5 items-baseline text-[13.5px] leading-[1.4] text-tz-bone/90">
                  <span className="shrink-0 w-[34px] text-[11px] font-bold tracking-[.04em] text-apta-gold tabular-nums">
                    S{m.week}
                  </span>
                  <span>{m.milestone}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/* ── 3. Panel del día ─────────────────────────────────────────────────────── */

function DayPanel({
  memberId,
  mesocycleId,
  phase,
  day,
  safetyCriteria,
  editing,
  setEditing,
}: {
  memberId: string;
  mesocycleId: string;
  phase: Phase;
  day: Day;
  safetyCriteria: string[];
  editing: Editing;
  setEditing: (next: Editing) => void;
}) {
  const warmup = strings(day.warmup);
  const editingExerciseId = typeof editing === "object" && editing ? editing.exerciseId : null;

  return (
    <section className="bg-brand-card border border-brand-border rounded-card shadow-card px-5 sm:px-7 pt-[26px] pb-7">
      <div className="flex items-start justify-between gap-5 flex-wrap pb-5 border-b border-brand-subtle-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-gold">
            <span>
              Fase {phase.order + 1} · semanas {phase.weekFrom}–{phase.weekTo}
            </span>
            <span className="w-[3px] h-[3px] rounded-full bg-brand-border" aria-hidden="true" />
            <span className="text-brand-muted normal-case tracking-normal">{phase.name}</span>
          </div>
          <h2 className="mt-2 text-[28px] font-extrabold tracking-[-0.02em] leading-[1.1] text-brand-text">
            {day.label}
          </h2>
          {editing !== "day" && <p className="mt-1.5 text-[15px] text-brand-text-2">{day.focus}</p>}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-[7px] rounded-pill bg-gold-bg px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[.05em] text-gold">
            <VenueIcon />
            {day.venue}
          </span>
          <span className="inline-flex items-center gap-[7px] rounded-pill bg-brand-bg px-3 py-1.5 text-[11.5px] font-bold text-brand-text-2 tabular-nums">
            <ClockIcon />
            {dayMinutes(day)} min
          </span>
          {editing !== "day" && (
            <button
              type="button"
              onClick={() => setEditing("day")}
              className="inline-flex items-center gap-[7px] min-h-[36px] rounded-pill bg-brand-card border border-brand-border px-[13px] py-1.5 text-[11.5px] font-bold text-brand-text-2 transition-[border-color,color] duration-200 ease-out-soft hover:border-brand-ink hover:text-brand-text"
            >
              <PencilIcon />
              Editar día
            </button>
          )}
        </div>
      </div>

      {editing === "day" && (
        <DayForm
          memberId={memberId}
          mesocycleId={mesocycleId}
          day={day}
          onClose={() => setEditing(null)}
        />
      )}

      {/* En el gimnasio lo que hay que tener delante es lo que NO se programa:
          en pantalla pequeña la cabecera en tinta ya ha quedado arriba del todo. */}
      {safetyCriteria.length > 0 && (
        <div className="lg:hidden mt-5 bg-critical-bg rounded-[14px] px-4 py-3.5">
          <div className="text-[9.5px] font-bold uppercase tracking-[.14em] text-critical">No se programa</div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {safetyCriteria.map((line, i) => (
              <li key={i} className="text-[12.5px] leading-[1.4] text-critical">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <PhaseNotes
        memberId={memberId}
        mesocycleId={mesocycleId}
        phase={phase}
        editing={editing === "phase"}
        onEdit={() => setEditing("phase")}
        onClose={() => setEditing(null)}
      />

      {warmup.length > 0 && (
        <div className="mt-[22px]">
          <RuleLabel>Calentamiento</RuleLabel>
          <div className="flex flex-wrap gap-[7px]">
            {warmup.map((move, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-[9px] bg-brand-bg border border-brand-subtle-2 px-3 py-2 text-[13px] text-brand-text-2"
              >
                {move}
              </span>
            ))}
          </div>
        </div>
      )}

      {day.blocks.map((block) => (
        <div key={block.id} className="mt-[26px]">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[.16em] text-brand-text shrink-0">
              {block.name}
            </span>
            <span className="text-[11px] font-semibold text-brand-muted tabular-nums whitespace-nowrap shrink-0">
              {block.durationMin} min
            </span>
            <span className="flex-1 h-px bg-brand-subtle-2" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-2">
            {block.exercises.map((exercise) => (
              <ExerciseCard
                key={exercise.id}
                memberId={memberId}
                mesocycleId={mesocycleId}
                exercise={exercise}
                editing={editingExerciseId === exercise.id}
                onOpen={() => setEditing({ exerciseId: exercise.id })}
                onClose={() => setEditing(null)}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function DayForm({
  memberId,
  mesocycleId,
  day,
  onClose,
}: {
  memberId: string;
  mesocycleId: string;
  day: Day;
  onClose: () => void;
}) {
  const { pending, run } = useAction();
  const [focus, setFocus] = useState(day.focus);
  const [venue, setVenue] = useState(day.venue);
  const [warmup, setWarmup] = useState(() => strings(day.warmup).join("\n"));

  return (
    <div className="mt-5 bg-brand-bg border border-brand-border rounded-[14px] px-5 py-[18px] flex flex-col gap-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Field label="Foco">
          <Input value={focus} onChange={(e) => setFocus(e.target.value)} />
        </Field>
        <Field label="Dónde entrena">
          <Input value={venue} onChange={(e) => setVenue(e.target.value)} />
        </Field>
      </div>
      <Field label="Calentamiento" hint="Un movimiento por línea.">
        <Textarea rows={4} value={warmup} onChange={(e) => setWarmup(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => updateMesocycleDayAction(memberId, mesocycleId, day.id, { focus, venue, warmup }),
              "Día guardado.",
              onClose
            )
          }
        >
          Guardar día
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Notas de la fase. El prototipo solo las enseña leídas, pero el campo tiene
 * que seguir siendo editable (`updateMesocyclePhaseAction` mueve nombre y
 * notas), así que el bloque se pinta siempre y cuelga de él su `Editar fase`.
 */
function PhaseNotes({
  memberId,
  mesocycleId,
  phase,
  editing,
  onEdit,
  onClose,
}: {
  memberId: string;
  mesocycleId: string;
  phase: Phase;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState(phase.name);
  const [notes, setNotes] = useState(phase.notes ?? "");

  if (editing) {
    return (
      <div className="mt-5 bg-brand-bg border border-brand-border rounded-[14px] px-5 py-[18px] flex flex-col gap-3.5">
        <Field label={`Fase ${phase.order + 1} · semanas ${phase.weekFrom}–${phase.weekTo}`}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Notas de la fase">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              run(
                () => updateMesocyclePhaseAction(memberId, mesocycleId, phase.id, { name, notes }),
                "Fase guardada.",
                onClose
              )
            }
          >
            Guardar fase
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setName(phase.name);
              setNotes(phase.notes ?? "");
              onClose();
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 flex items-start gap-[11px] flex-wrap bg-brand-bg rounded-xl px-4 py-3.5">
      <span className="text-[10px] font-bold uppercase tracking-[.12em] text-gold shrink-0 pt-0.5">Fase</span>
      <p className="flex-[1_1_240px] text-[13.5px] leading-[1.5] text-brand-text-2 text-pretty">
        {phase.notes ?? <span className="text-brand-muted">Sin notas de fase.</span>}
      </p>
      <button
        type="button"
        onClick={onEdit}
        className="shrink-0 ml-auto inline-flex items-center gap-1.5 min-h-[24px] text-[10px] font-bold uppercase tracking-[.1em] text-brand-muted transition-colors duration-200 ease-out-soft hover:text-brand-text"
      >
        <PencilIcon />
        Editar fase
      </button>
    </div>
  );
}

/**
 * El ejercicio en lectura es el elemento central del rediseño: nombre,
 * ejecución y el porqué a la izquierda, y la dosis a la derecha en un bloque
 * que se lee de un vistazo. La tarjeta entera es el botón que abre la edición.
 */
function ExerciseCard({
  memberId,
  mesocycleId,
  exercise,
  editing,
  onOpen,
  onClose,
}: {
  memberId: string;
  mesocycleId: string;
  exercise: Exercise;
  editing: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState(exercise.name);
  const [sets, setSets] = useState(String(exercise.sets));
  const [reps, setReps] = useState(exercise.reps);
  const [load, setLoad] = useState(exercise.load ?? "");
  const [description, setDescription] = useState(exercise.description);
  const [rationale, setRationale] = useState(exercise.rationale);

  function cancel() {
    setName(exercise.name);
    setSets(String(exercise.sets));
    setReps(exercise.reps);
    setLoad(exercise.load ?? "");
    setDescription(exercise.description);
    setRationale(exercise.rationale);
    onClose();
  }

  return (
    <div className="border border-brand-subtle-2 rounded-[14px] bg-brand-card overflow-hidden">
      {editing ? (
        <div className="bg-surface-soft p-[18px] flex flex-col gap-3.5">
          <Field label="Ejercicio">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Field label="Series">
              <Input type="number" min={1} value={sets} onChange={(e) => setSets(e.target.value)} />
            </Field>
            <Field label="Repeticiones">
              <Input value={reps} onChange={(e) => setReps(e.target.value)} />
            </Field>
            <Field label="Carga">
              <Input value={load} onChange={(e) => setLoad(e.target.value)} />
            </Field>
          </div>
          <Field label="Ejecución">
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Por qué este ejercicio" hint="Obligatorio: es lo que separa el mesociclo de una plantilla.">
            <Textarea rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </Field>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    updateMesocycleExerciseAction(memberId, mesocycleId, exercise.id, {
                      name,
                      sets: Number(sets),
                      reps,
                      load,
                      description,
                      rationale,
                    }),
                  "Ejercicio guardado.",
                  onClose
                )
              }
            >
              Guardar ejercicio
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={cancel}>
              Cancelar
            </Button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => deleteMesocycleExerciseAction(memberId, mesocycleId, exercise.id),
                  "Ejercicio eliminado.",
                  onClose
                )
              }
              className="ml-auto rounded-lg border border-critical-bg px-4 py-1.5 text-xs font-semibold text-critical transition-[background-color,border-color,transform] duration-200 ease-out-soft hover:bg-critical-bg active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
            >
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="w-full text-left px-3.5 sm:px-[18px] py-4 flex items-start gap-3 sm:gap-4 flex-wrap transition-colors duration-200 ease-out-soft hover:bg-surface-soft"
        >
          <span className="flex-[1_1_240px] min-w-[min(160px,100%)] sm:min-w-[min(220px,100%)] flex flex-col gap-[5px]">
            <span className="text-[15.5px] font-bold tracking-[-0.01em] text-brand-text">{exercise.name}</span>
            <span className="text-[13px] leading-[1.5] text-brand-text-2 text-pretty">{exercise.description}</span>
            <span className="flex gap-[9px] mt-[3px]">
              <span className="w-[52px] shrink-0 pt-[3px] text-[9.5px] font-bold uppercase tracking-[.14em] text-gold">
                Por qué
              </span>
              <span className="text-[12.5px] leading-[1.5] text-brand-muted text-pretty">{exercise.rationale}</span>
            </span>
          </span>
          <span className="shrink-0 ml-auto min-w-[96px] sm:min-w-[118px] flex flex-col items-end gap-1 bg-brand-bg rounded-[11px] px-3 py-2.5 sm:px-3.5">
            <span className="text-[17px] font-extrabold tracking-[-0.01em] text-brand-text tabular-nums whitespace-nowrap">
              {doseOf(exercise)}
            </span>
            <span className="text-[10.5px] font-bold uppercase tracking-[.08em] text-gold whitespace-nowrap">
              {loadLabelOf(exercise)}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ── 4. Barra de refinado ─────────────────────────────────────────────────── */

/**
 * El refinado vive en una barra pegada al fondo de la columna de detalle, no en
 * una tarjeta más de la pila. Mientras la IA reescribe, la propia barra es la
 * barra de progreso: sin velo a pantalla completa, para que el entrenador siga
 * leyendo el plan durante el minuto que tarda.
 */
function RefineBar({
  memberId,
  mesocycleId,
  aiConfigured,
  history,
}: {
  memberId: string;
  mesocycleId: string;
  aiConfigured: boolean;
  history: RefineRequest[];
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [request, setRequest] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const loader = usePacedLoader(MESOCYCLE_REFINE_STEPS, EXPECTED_REFINE_MS);

  const busy = pending || loader.loading;
  const disabled = !aiConfigured || busy;

  function refine() {
    if (!request.trim() || disabled) return;
    loader.start();

    startTransition(async () => {
      const result = await refineMesocycleAction(memberId, mesocycleId, request);

      if (!result.ok) {
        loader.abort();
        toast.error(result.error);
        return;
      }

      setRequest("");
      loader.finish(() => toast.success("Plan refinado. Vuelve a revisarlo antes de aprobarlo."));
    });
  }

  const stepLabel = MESOCYCLE_REFINE_STEPS[Math.min(loader.step, MESOCYCLE_REFINE_STEPS.length - 1)].label;

  if (busy) {
    return (
      <div className="sticky bottom-0 z-20 pb-1">
        <div
          className="bg-tz-black text-tz-bone rounded-card px-5 pt-4 pb-3.5 flex flex-col gap-[11px]"
          style={{ boxShadow: "0 18px 44px -16px rgba(29,29,28,.4)" }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-[11px] flex-wrap">
            <span
              className="w-[7px] h-[7px] rounded-full bg-apta-gold shrink-0"
              style={{ animation: "tzLiveDot 1.1s ease-in-out infinite" }}
              aria-hidden="true"
            />
            <span className="text-[14.5px] font-semibold">{stepLabel}</span>
            <span className="ml-auto text-[11.5px] text-tz-bone/45">
              Suele tardar cerca de un minuto. No cierres esta ventana.
            </span>
          </div>
          <div className="flex gap-[5px]" aria-hidden="true">
            {MESOCYCLE_REFINE_STEPS.map((step, i) => (
              <span
                key={step.label}
                className={clsx(
                  "flex-1 h-[3px] rounded-pill transition-colors duration-200 ease-out-soft",
                  i <= loader.step || loader.done ? "bg-apta-gold" : "bg-tz-bone/20"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-20 pb-1">
      <div className="relative">
        {historyOpen && (
          <div className="absolute bottom-[calc(100%+10px)] right-0 w-[460px] max-w-full bg-brand-card border border-brand-border rounded-[14px] shadow-pop p-3.5 flex flex-col gap-1">
            <div className="flex items-center justify-between px-1.5 pt-0.5 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-[.14em] text-brand-faint">
                Lo que ya le has pedido
              </span>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="text-xs font-semibold text-brand-text-2 hover:text-brand-text"
              >
                Cerrar
              </button>
            </div>
            {history.length === 0 ? (
              <p className="px-1.5 py-2 text-[13px] text-brand-muted">
                Todavía no le has pedido ningún cambio a este plan.
              </p>
            ) : (
              <div className="max-h-[300px] overflow-y-auto">
                {history.map((entry, i) => (
                  <div key={i} className="flex gap-[11px] px-1.5 py-2.5 border-t border-brand-bg">
                    <span className="shrink-0 pt-0.5 text-[10.5px] font-bold text-brand-faint whitespace-nowrap tabular-nums">
                      {entry.label}
                    </span>
                    <span className="text-[13px] leading-[1.45] text-brand-text-2 text-pretty">{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div
          className="flex items-center gap-3 flex-wrap bg-brand-card border border-brand-border rounded-card py-2.5 pl-[18px] pr-3"
          style={{ boxShadow: "0 18px 44px -16px rgba(29,29,28,.28)" }}
        >
          <span className="inline-flex items-center gap-[9px] shrink-0">
            <span className="tz-gold-dot w-[7px] h-[7px] rounded-full" aria-hidden="true" />
            <span className="text-[10.5px] font-bold uppercase tracking-[.14em] text-gold">Refinar con IA</span>
          </span>
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              refine();
            }}
            disabled={!aiConfigured}
            aria-label="Qué quieres cambiar del plan"
            placeholder="«Cambia la fase 2, no me gusta el broad jump»"
            className="flex-1 min-w-[200px] border-none outline-none bg-transparent py-2 text-[14.5px] text-brand-text placeholder:text-brand-faint disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="inline-flex items-center gap-[7px] shrink-0 rounded-control border border-brand-subtle-2 px-3 py-2 text-[11.5px] font-bold text-brand-text-2 transition-[background-color,border-color] duration-200 ease-out-soft hover:border-brand-border hover:bg-brand-bg"
          >
            Historial · {history.length}
            <ChevronIcon open={historyOpen} />
          </button>
          <button
            type="button"
            onClick={refine}
            disabled={disabled}
            className="inline-flex items-center gap-2 shrink-0 rounded-[11px] bg-tz-black px-[18px] py-[11px] text-[13px] font-bold text-tz-bone transition-[opacity,transform] duration-200 ease-out-soft hover:opacity-90 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none"
          >
            Pedir cambio
            <ArrowIcon />
          </button>
        </div>

        {!aiConfigured && (
          <p className="mt-2 text-xs text-brand-muted">
            La generación con IA no está configurada en este entorno (falta ANTHROPIC_API_KEY).
          </p>
        )}
      </div>
    </div>
  );
}

/* ── 6. Documento imprimible ──────────────────────────────────────────────── */

/**
 * Lo que se lleva el socio. No es la pantalla impresa: es un documento aparte
 * en flujo, sin rail ni barra de refinado, que solo existe en `@media print`
 * (ver el bloque de `globals.css`). El borrador se imprime marcado como tal:
 * un plan sin firmar no debería confundirse con uno aprobado.
 */
function PrintDocument({ mesocycle, memberName }: { mesocycle: MesocycleDetail; memberName: string }) {
  const weekly = strings(mesocycle.weeklyLayout);
  const safety = strings(mesocycle.safetyCriteria);
  const meta = metaOf(mesocycle, memberName);

  return (
    <div className="tz-print-doc hidden print:block">
      {mesocycle.status === "DRAFT" && <div className="tz-print-watermark">Borrador</div>}

      <div className="border-b-2 border-brand-text pb-3.5 mb-5">
        <div className="text-[10pt] font-bold uppercase tracking-[.16em] text-gold">Training Zone · Mesociclo</div>
        <h1 className="mt-2 text-[20pt] font-extrabold tracking-[-0.02em] leading-[1.2]">{mesocycle.title}</h1>
        <p className="mt-2 text-[11pt] leading-[1.5] text-brand-text-2 max-w-[70ch]">{mesocycle.objective}</p>
        <div className="mt-2.5 text-[10pt] text-brand-muted">{meta}</div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-[22px]">
        <div>
          <div className="text-[9.5pt] font-bold uppercase tracking-[.14em] text-gold mb-2">Semana tipo</div>
          <ul className="list-disc pl-4 text-[11pt] leading-[1.7]">
            {weekly.map((chip, i) => (
              <li key={i}>{chip}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-[9.5pt] font-bold uppercase tracking-[.14em] text-critical mb-2">No se programa</div>
          <ul className="list-disc pl-4 text-[11pt] leading-[1.7]">
            {safety.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      </div>

      {mesocycle.phases.map((phase) => (
        <div key={phase.id} className="mb-[22px] break-inside-avoid">
          <div className="bg-brand-bg rounded-lg px-3.5 py-2.5">
            <span className="text-[9.5pt] font-bold uppercase tracking-[.14em] text-gold">
              Fase {phase.order + 1} · semanas {phase.weekFrom}–{phase.weekTo}
            </span>
            <span className="ml-2.5 text-[12pt] font-bold">{phase.name}</span>
          </div>

          {phase.days.map((day) => (
            <div key={day.id} className="break-inside-avoid pt-3.5 pb-2.5 border-b border-brand-subtle-2">
              <div className="text-[12pt] font-bold">
                {day.label}{" "}
                <span className="font-medium text-brand-text-2">
                  · {day.focus} · {day.venue}
                </span>
              </div>
              {strings(day.warmup).length > 0 && (
                <div className="mt-1.5 text-[10pt] text-brand-text-2">
                  <b>Calentamiento:</b> {strings(day.warmup).join(" · ")}
                </div>
              )}
              {day.blocks.map((block) => (
                <div key={block.id} className="mt-2">
                  <div className="text-[9.5pt] font-bold uppercase tracking-[.1em] text-brand-muted">
                    {block.name} · {block.durationMin} min
                  </div>
                  {block.exercises.map((exercise) => (
                    <div key={exercise.id} className="flex gap-3.5 py-[5px] pl-0.5 text-[11pt]">
                      <span className="w-[110px] shrink-0 font-bold tabular-nums">
                        {doseOf(exercise)}
                        {exercise.load ? ` · ${exercise.load}` : ""}
                      </span>
                      <span>
                        <b>{exercise.name}</b> — {exercise.description}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
