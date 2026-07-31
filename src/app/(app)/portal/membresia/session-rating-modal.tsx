"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { submitSessionRatingAction } from "./actions";

const TAGS = ["Motivador", "Técnico", "Puntual", "Exigente", "Cercano", "Buena energía"];
const DISCOMFORT_OPTIONS = ["Ninguna", "Leve", "Moderada"];
const COMPLETED_OPTIONS = ["Sí, todos", "Casi todos", "A medias"];

type SliderKey = "trainerScore" | "energy" | "rpe";

export type RatingSession = {
  bookingId: string;
  sessionName: string;
  meta: string;
  trainerName: string | null;
};

type Answers = {
  trainerScore: number;
  energy: number;
  rpe: number;
  discomfort: string | null;
  completed: string | null;
  tags: string[];
};

const DEFAULT_ANSWERS: Answers = { trainerScore: 8, energy: 7, rpe: 6, discomfort: null, completed: null, tags: [] };

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function initials(name: string) {
  return name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export function SessionRatingModal({ session, onClose }: { session: RatingSession | null; onClose: () => void }) {
  const mounted = useMounted();
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState<SliderKey | null>(null);
  const dragRef = useRef<{ key: SliderKey; rect: DOMRect } | null>(null);

  // Reinicia el wizard cuando se abre una sesión nueva (patrón "ajustar estado
  // durante el render" de React: evita el setState síncrono dentro de un efecto).
  const [openBookingId, setOpenBookingId] = useState<string | null>(null);
  if (session && session.bookingId !== openBookingId) {
    setOpenBookingId(session.bookingId);
    setStep(0);
    setAnswers(DEFAULT_ANSWERS);
    setPending(false);
  }

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [session, onClose]);

  function moveTo(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const t = Math.max(0, Math.min(1, (clientX - drag.rect.left) / drag.rect.width));
    const value = Math.round(1 + t * 9);
    setAnswers((a) => (a[drag.key] === value ? a : { ...a, [drag.key]: value }));
  }

  function onPointerDown(key: SliderKey, e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragRef.current = { key, rect: e.currentTarget.getBoundingClientRect() };
    setDragging(key);
    moveTo(e.clientX);
    const onMove = (ev: PointerEvent) => {
      ev.preventDefault();
      moveTo(ev.clientX);
    };
    const onUp = () => {
      dragRef.current = null;
      setDragging(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function toggleTag(tag: string) {
    setAnswers((a) => ({ ...a, tags: a.tags.includes(tag) ? a.tags.filter((t) => t !== tag) : [...a.tags, tag] }));
  }

  async function submit() {
    if (!session || pending) return;
    setPending(true);
    const result = await submitSessionRatingAction(session.bookingId, {
      trainerScore: answers.trainerScore,
      tags: answers.tags,
      energy: answers.energy,
      rpe: answers.rpe,
      discomfort: answers.discomfort,
      completed: answers.completed,
    });
    setPending(false);
    if (result.ok) {
      setStep(2);
      router.refresh();
    }
  }

  if (!mounted) return null;

  const open = !!session;
  const trainerFirstName = session?.trainerName?.split(" ")[0] ?? "";

  return createPortal(
    <div
      onClick={onClose}
      aria-hidden={!open}
      className={`fixed inset-0 z-[80] flex items-center justify-center p-5 bg-[rgba(20,20,18,.55)] backdrop-blur-[3px] transition-opacity ${
        open ? "opacity-100 pointer-events-auto duration-[220ms]" : "opacity-0 pointer-events-none duration-[180ms]"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Valoración de sesión"
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full max-h-[92vh] bg-white rounded-[22px] overflow-hidden flex flex-col shadow-pop transition-[transform,opacity] duration-[260ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: open ? "translateY(0) scale(1)" : "translateY(18px) scale(.96)", opacity: open ? 1 : 0 }}
      >
        {session && (
          <>
            <div className="relative pt-[22px] px-[26px] pb-[18px] border-b border-[#eeede6] shrink-0">
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute top-[18px] right-5 w-8 h-8 rounded-[9px] border border-[#e0d9cb] bg-[#faf8f3] text-brand-text-2 flex items-center justify-center hover:bg-brand-ink hover:text-white hover:border-brand-ink transition-colors duration-150"
              >
                ✕
              </button>
              <div className="text-[11px] font-bold tracking-[.12em] uppercase text-brand-muted">Valoración de sesión</div>
              <div className="font-display font-extrabold text-[21px] text-brand-text mt-1.5 tracking-[-.01em] pr-10">
                {session.sessionName}
              </div>
              <div className="text-[13px] text-brand-muted mt-[3px]">{session.meta}</div>
              {step < 2 && (
                <div className="flex items-center gap-2.5 mt-4">
                  <div className="flex-1 h-[5px] rounded-full bg-[#eee7d8] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: step === 0 ? "50%" : "100%", background: "linear-gradient(90deg,#4b5a22,#c8ab72)" }}
                    />
                  </div>
                  <span className="text-xs font-bold text-brand-muted whitespace-nowrap">Paso {step + 1} de 2</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden px-[26px] py-[26px]">
              {step === 0 && (
                <div className="flex flex-col gap-[30px]">
                  <div className="flex flex-col gap-1.5">
                    <div className="font-display font-extrabold text-[17px] text-brand-text">¿Cómo valoras a tu entrenador?</div>
                    <p className="text-[13.5px] text-brand-muted leading-[1.5]">
                      Arrastra para puntuar la sesión de {session.trainerName ?? "tu entrenador"}.
                    </p>
                  </div>
                  <RatingSlider
                    label="Valoración global"
                    value={answers.trainerScore}
                    colorStop="#c8ab72"
                    dragging={dragging === "trainerScore"}
                    onPointerDown={(e) => onPointerDown("trainerScore", e)}
                    onChange={(v) => setAnswers((a) => ({ ...a, trainerScore: v }))}
                    showMarks
                  />
                  <div>
                    <div className="text-sm font-bold text-brand-text mb-3">
                      ¿Qué destacarías? <span className="font-medium text-brand-muted-2">· opcional</span>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleTag(tag)}
                          className={`text-[13.5px] font-semibold rounded-full px-4 py-2.5 border transition-colors duration-150 ${
                            answers.tags.includes(tag)
                              ? "bg-good border-good text-white"
                              : "bg-[#faf8f3] border-brand-border text-brand-text-2"
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-[30px]">
                  <div className="flex flex-col gap-1.5">
                    <div className="font-display font-extrabold text-[17px] text-brand-text">Ahora, evalúate tú</div>
                    <p className="text-[13.5px] text-brand-muted leading-[1.5]">
                      Sé sincera: esto ayuda a tu entrenador a ajustar tu plan.
                    </p>
                  </div>
                  <RatingSlider
                    label="Nivel de energía"
                    hint="¿Con qué energía llegaste?"
                    value={answers.energy}
                    colorStop="#c8ab72"
                    dragging={dragging === "energy"}
                    onPointerDown={(e) => onPointerDown("energy", e)}
                    onChange={(v) => setAnswers((a) => ({ ...a, energy: v }))}
                    edgeLabels={["Agotada", "Con fuerza"]}
                  />
                  <RatingSlider
                    label="Esfuerzo percibido"
                    hint="Lo duro que fue para ti (RPE)"
                    value={answers.rpe}
                    colorStop="#8a5a12"
                    dragging={dragging === "rpe"}
                    onPointerDown={(e) => onPointerDown("rpe", e)}
                    onChange={(v) => setAnswers((a) => ({ ...a, rpe: v }))}
                    edgeLabels={["Muy suave", "Al límite"]}
                  />
                  <ChoiceGroup
                    title="¿Notaste alguna molestia?"
                    options={DISCOMFORT_OPTIONS}
                    value={answers.discomfort}
                    onChange={(v) => setAnswers((a) => ({ ...a, discomfort: v }))}
                  />
                  <ChoiceGroup
                    title="¿Completaste todos los ejercicios?"
                    options={COMPLETED_OPTIONS}
                    value={answers.completed}
                    onChange={(v) => setAnswers((a) => ({ ...a, completed: v }))}
                  />
                </div>
              )}

              {step === 2 && (
                <div className="flex flex-col items-center text-center gap-3.5 py-6 px-2">
                  <span className="w-[72px] h-[72px] rounded-full bg-[#eef0e4] text-good flex items-center justify-center text-[34px] [animation:tzPop_.4s_ease_both]">
                    ✓
                  </span>
                  <div className="font-display font-extrabold text-[22px] text-brand-text">¡Gracias!</div>
                  <p className="text-sm text-brand-muted max-w-[340px] leading-[1.55]">
                    Tu valoración de <b className="text-brand-text">{answers.trainerScore}/10</b>
                    {session.trainerName ? ` para ${session.trainerName}` : ""} y tu autoevaluación se han enviado.
                    {trainerFirstName && ` ${trainerFirstName} lo revisará antes de tu próxima sesión.`}
                  </p>
                </div>
              )}
            </div>

            <div className="shrink-0 py-4 px-[26px] border-t border-[#eeede6] flex items-center gap-3">
              {step === 1 && (
                <button
                  onClick={() => setStep(0)}
                  className="bg-white text-brand-text-2 border border-brand-border rounded-[11px] px-5 py-[13px] font-display font-bold text-[13.5px] hover:bg-tz-bone transition-colors duration-150"
                >
                  Atrás
                </button>
              )}
              <span className="flex-1" />
              {step === 0 && (
                <button
                  onClick={() => setStep(1)}
                  className="bg-brand-ink text-tz-bone rounded-[11px] px-[26px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-brand-ink-soft active:scale-[.98] transition-[background-color,transform] duration-150"
                >
                  Continuar →
                </button>
              )}
              {step === 1 && (
                <button
                  disabled={pending}
                  onClick={submit}
                  className="bg-good text-white rounded-[11px] px-[26px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-[#3c4a19] active:scale-[.98] transition-[background-color,transform] duration-150 disabled:opacity-60"
                >
                  {pending ? "Enviando…" : "Enviar valoración"}
                </button>
              )}
              {step === 2 && (
                <button
                  onClick={onClose}
                  className="w-full bg-brand-ink text-tz-bone rounded-[11px] px-[30px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-brand-ink-soft transition-colors duration-150"
                >
                  Hecho
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function RatingSlider({
  label,
  hint,
  value,
  colorStop,
  dragging,
  onPointerDown,
  onChange,
  edgeLabels,
  showMarks,
}: {
  label: string;
  hint?: string;
  value: number;
  colorStop: string;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onChange: (value: number) => void;
  edgeLabels?: [string, string];
  showMarks?: boolean;
}) {
  const pct = ((value - 1) / 9) * 100;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.min(10, value + 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.max(1, value - 1));
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-brand-text">{label}</div>
          {hint && <div className="text-[12.5px] text-brand-muted mt-0.5">{hint}</div>}
        </div>
        <div className="flex items-baseline gap-[3px]">
          <span
            className={`font-display font-extrabold leading-[.9] text-brand-text tabular-nums ${
              showMarks ? "text-[44px]" : "text-[40px]"
            }`}
          >
            {value}
          </span>
          <span className="text-base font-bold text-brand-muted-2">/10</span>
        </div>
      </div>
      <div
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        role="slider"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={value}
        tabIndex={0}
        className="relative h-4 rounded-full bg-tz-sand touch-none cursor-pointer select-none mt-5 mx-1.5"
      >
        <div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg,#4b5a22,${colorStop})` }}
        />
        <div
          className="absolute top-1/2 w-[30px] h-[30px] rounded-full bg-white border-[3px] border-brand-ink shadow-[0_6px_16px_-4px_rgba(29,29,28,.5)] cursor-grab touch-none"
          style={{
            left: `${pct}%`,
            transform: `translate(-50%,-50%) scale(${dragging ? 1.18 : 1})`,
            transition: dragging ? "none" : "transform .14s",
          }}
        />
      </div>
      {showMarks ? (
        <div className="flex justify-between mt-3.5 mx-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              className={`text-xs font-bold tabular-nums w-[18px] text-center ${
                n === value ? "text-brand-text" : "text-[#c2bba8]"
              }`}
            >
              {n}
            </span>
          ))}
        </div>
      ) : (
        edgeLabels && (
          <div className="flex justify-between mt-3 mx-1.5">
            <span className="text-xs font-semibold text-brand-muted-2">{edgeLabels[0]}</span>
            <span className="text-xs font-semibold text-brand-muted-2">{edgeLabels[1]}</span>
          </div>
        )
      )}
    </div>
  );
}

function ChoiceGroup({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="text-[15px] font-bold text-brand-text mb-3">{title}</div>
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`text-[13.5px] rounded-full px-[18px] py-2.5 border transition-colors duration-150 ${
              value === opt
                ? "bg-brand-ink border-brand-ink text-white font-bold"
                : "bg-[#faf8f3] border-brand-border text-brand-text-2 font-semibold"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
