"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { submitClientFeedbackAction } from "./feedback-actions";

type DimKey = "sat" | "prog" | "adher" | "motiv" | "esf" | "descanso" | "nutricion" | "bienestar" | "comunicacion";

const DIMENSIONS: { key: DimKey; label: string; hint: string }[] = [
  { key: "sat", label: "Satisfacción", hint: "¿Qué tan contento/a estás con tu experiencia últimamente?" },
  { key: "prog", label: "Progreso", hint: "¿Sientes que estás avanzando hacia tu objetivo?" },
  { key: "adher", label: "Adherencia", hint: "¿Qué tan bien estás cumpliendo tu plan?" },
  { key: "motiv", label: "Motivación", hint: "¿Con qué ganas vienes a entrenar ahora mismo?" },
  { key: "esf", label: "Esfuerzo", hint: "¿Cuánto esfuerzo estás poniendo tú de tu parte?" },
  { key: "descanso", label: "Descanso", hint: "¿Qué tal estás durmiendo y recuperando entre sesiones?" },
  { key: "nutricion", label: "Nutrición", hint: "¿Qué tan bien estás cuidando tu alimentación?" },
  { key: "bienestar", label: "Bienestar físico", hint: "¿Cómo te encuentras físicamente, sin dolores ni molestias?" },
  { key: "comunicacion", label: "Comunicación", hint: "¿Qué tan cómodo/a te sientes contándole a tu entrenador dudas o molestias?" },
];

const DEFAULT_DIMS: Record<DimKey, number> = {
  sat: 8,
  prog: 7,
  adher: 7,
  motiv: 8,
  esf: 7,
  descanso: 7,
  nutricion: 7,
  bienestar: 8,
  comunicacion: 8,
};

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function PendingFeedbackBanner({ hasPending }: { hasPending: boolean }) {
  const [open, setOpen] = useState(false);
  if (!hasPending) return null;

  return (
    <>
      <div className="relative overflow-hidden bg-brand-ink border border-brand-border-dark rounded-[18px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between tz-fade-up">
        <div>
          <div className="inline-flex items-center gap-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-apta-gold">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-apta-gold" />
            Feedback pendiente de este mes
          </div>
          <p className="text-[14.5px] text-tz-bone mt-2 max-w-[480px] leading-[1.5]">
            Tu entrenador también va a dejar su valoración de tus últimas semanas — necesitamos la tuya para que la
            comparación sea real. Son 9 preguntas de un toque, sin escribir nada: menos de dos minutos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 bg-tz-bone text-tz-black rounded-[11px] px-6 py-3 font-display font-extrabold text-sm uppercase tracking-[.03em] transition-transform duration-150 hover:-translate-y-0.5 active:scale-[.98]"
        >
          Responder ahora →
        </button>
      </div>
      <ClientFeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ClientFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mounted = useMounted();
  const router = useRouter();
  const [dims, setDims] = useState<Record<DimKey, number>>(DEFAULT_DIMS);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState<DimKey | null>(null);
  const dragRef = useRef<{ key: DimKey; rect: DOMRect } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  function moveTo(clientX: number) {
    const drag = dragRef.current;
    if (!drag) return;
    const t = Math.max(0, Math.min(1, (clientX - drag.rect.left) / drag.rect.width));
    const value = Math.round(t * 10);
    setDims((d) => (d[drag.key] === value ? d : { ...d, [drag.key]: value }));
  }

  function onPointerDown(key: DimKey, e: React.PointerEvent<HTMLDivElement>) {
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

  async function submit() {
    if (pending) return;
    setPending(true);
    const result = await submitClientFeedbackAction({ ...dims, comment });
    setPending(false);
    if (result.ok) {
      setDone(true);
      router.refresh();
    }
  }

  function handleClose() {
    onClose();
    // Reset diferido: que no se vea el formulario en blanco durante el cierre.
    setTimeout(() => {
      setDims(DEFAULT_DIMS);
      setComment("");
      setDone(false);
    }, 200);
  }

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={handleClose}
      aria-hidden={!open}
      className={`fixed inset-0 z-[80] flex items-center justify-center p-5 bg-[rgba(20,20,18,.55)] backdrop-blur-[3px] transition-opacity ${
        open ? "opacity-100 pointer-events-auto duration-[220ms]" : "opacity-0 pointer-events-none duration-[180ms]"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Feedback mensual"
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-full max-h-[92vh] bg-white rounded-[22px] overflow-hidden flex flex-col shadow-pop transition-[transform,opacity] duration-[260ms] [transition-timing-function:cubic-bezier(.2,.8,.2,1)]"
        style={{ transform: open ? "translateY(0) scale(1)" : "translateY(18px) scale(.96)", opacity: open ? 1 : 0 }}
      >
        <div className="relative pt-[22px] px-[26px] pb-[18px] border-b border-[#eeede6] shrink-0">
          <button
            onClick={handleClose}
            aria-label="Cerrar"
            className="absolute top-[18px] right-5 w-8 h-8 rounded-[9px] border border-[#e0d9cb] bg-[#faf8f3] text-brand-text-2 flex items-center justify-center hover:bg-brand-ink hover:text-white hover:border-brand-ink transition-colors duration-150"
          >
            ✕
          </button>
          <div className="text-[11px] font-bold tracking-[.12em] uppercase text-brand-muted">Feedback mensual</div>
          <div className="font-display font-extrabold text-[21px] text-brand-text mt-1.5 tracking-[-.01em] pr-10">
            Cómo lo llevas
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-[26px] py-[26px]">
          {!done ? (
            <div className="flex flex-col gap-[26px]">
              {DIMENSIONS.map(({ key, label, hint }) => (
                <div key={key}>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-bold text-brand-text">{label}</div>
                      <div className="text-[12.5px] text-brand-muted mt-0.5">{hint}</div>
                    </div>
                    <div className="flex items-baseline gap-[3px]">
                      <span className="font-display font-extrabold leading-[.9] text-brand-text tabular-nums text-[32px]">
                        {dims[key]}
                      </span>
                      <span className="text-base font-bold text-brand-muted-2">/10</span>
                    </div>
                  </div>
                  <div
                    onPointerDown={(e) => onPointerDown(key, e)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                        e.preventDefault();
                        setDims((d) => ({ ...d, [key]: Math.min(10, d[key] + 1) }));
                      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                        e.preventDefault();
                        setDims((d) => ({ ...d, [key]: Math.max(0, d[key] - 1) }));
                      }
                    }}
                    role="slider"
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={dims[key]}
                    tabIndex={0}
                    className="relative h-3.5 rounded-full bg-tz-sand touch-none cursor-pointer select-none mt-3 mx-1"
                  >
                    <div
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{ width: `${dims[key] * 10}%`, background: "linear-gradient(90deg,#4b5a22,#c8ab72)" }}
                    />
                    <div
                      className="absolute top-1/2 w-[26px] h-[26px] rounded-full bg-white border-[3px] border-brand-ink shadow-[0_6px_16px_-4px_rgba(29,29,28,.5)] cursor-grab touch-none"
                      style={{
                        left: `${dims[key] * 10}%`,
                        transform: `translate(-50%,-50%) scale(${dragging === key ? 1.15 : 1})`,
                        transition: dragging === key ? "none" : "transform .14s",
                      }}
                    />
                  </div>
                </div>
              ))}

              <div>
                <div className="text-sm font-bold text-brand-text mb-2">
                  ¿Algo más que quieras contarnos? <span className="font-medium text-brand-muted-2">· opcional</span>
                </div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Comparte lo que quieras, es solo para dirección..."
                  className="w-full rounded-control border border-brand-border bg-white px-4 py-3 text-[14px] text-brand-text placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-[3px] focus:ring-tz-black/[0.08] resize-none"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-3.5 py-6 px-2">
              <span className="w-[72px] h-[72px] rounded-full bg-[#eef0e4] text-good flex items-center justify-center text-[34px] [animation:tzPop_.4s_ease_both]">
                ✓
              </span>
              <div className="font-display font-extrabold text-[22px] text-brand-text">¡Gracias!</div>
              <p className="text-sm text-brand-muted max-w-[340px] leading-[1.55]">
                Tu feedback de este mes ya está enviado y dirección podrá contrastarlo con el de tu entrenador.
              </p>
            </div>
          )}
        </div>

        <div className="shrink-0 py-4 px-[26px] border-t border-[#eeede6] flex items-center gap-3">
          {!done ? (
            <button
              disabled={pending}
              onClick={submit}
              className="w-full bg-good text-white rounded-[11px] px-[26px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-[#3c4a19] active:scale-[.98] transition-[background-color,transform] duration-150 disabled:opacity-60"
            >
              {pending ? "Enviando…" : "Enviar feedback"}
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="w-full bg-brand-ink text-tz-bone rounded-[11px] px-[30px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-brand-ink-soft transition-colors duration-150"
            >
              Hecho
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
