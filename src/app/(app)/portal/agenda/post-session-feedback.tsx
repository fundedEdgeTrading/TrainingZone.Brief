"use client";

import { useState, useTransition } from "react";
import { submitPostSessionFeedback } from "./actions";
import { ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const FEELINGS = [
  { value: "GREEN" as const, label: "Genial", dot: "bg-good" },
  { value: "AMBER" as const, label: "Normal", dot: "bg-warning" },
  { value: "RED" as const, label: "Duro", dot: "bg-critical" },
];

const RPE_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Feeling = "GREEN" | "AMBER" | "RED";

function FeedbackCard({
  bookingId,
  sessionName,
  startTime,
  trainerName,
  sessionDate,
  onDone,
}: {
  bookingId: string;
  sessionName: string;
  startTime: string;
  trainerName: string | null;
  sessionDate: string;
  onDone: () => void;
}) {
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function submit() {
    if (!feeling) return;
    startTransition(async () => {
      const result = await submitPostSessionFeedback(bookingId, {
        feeling,
        rpe,
        comment: comment.trim() || null,
      });
      if (result.ok) {
        toast.success("¡Gracias por tu feedback!");
        onDone();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[268px_1fr] bg-brand-card border border-brand-border rounded-[20px] overflow-hidden shadow-[0_1px_2px_rgba(29,29,28,.04),0_24px_48px_-34px_rgba(29,29,28,.35)] tz-fade-up">
      {/* Rail de contexto */}
      <div className="bg-tz-sand border-b sm:border-b-0 sm:border-r border-brand-border px-7 py-[30px] flex flex-col justify-between gap-7">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[.2em] text-gold">Sesión completada</div>
          <div className="font-display font-extrabold text-[34px] leading-none tracking-[-.02em] text-brand-text mt-4">
            {startTime}
          </div>
          <div className="text-base font-bold text-brand-text mt-2">{sessionName}</div>
          <div className="text-[13px] text-brand-text-2 mt-1">
            {sessionDate}
            {trainerName ? ` · ${trainerName}` : ""}
          </div>
        </div>
        <p className="text-xs text-brand-muted leading-relaxed">Tu respuesta ajusta la carga de tu próxima sesión.</p>
      </div>

      {/* Panel de formulario */}
      <div className="px-[30px] py-7">
        <div className="flex items-start justify-between gap-5">
          <div className="text-xl font-bold tracking-[-.01em] text-brand-text">¿Cómo te ha ido?</div>
          <button
            onClick={onDone}
            className="text-xs font-semibold text-faint hover:text-brand-text transition-colors duration-150 shrink-0"
          >
            Omitir
          </button>
        </div>

        <div className="flex flex-col gap-5 mt-5">
          <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="¿Cómo te ha ido?">
            {FEELINGS.map((f) => {
              const active = feeling === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFeeling(f.value)}
                  aria-pressed={active}
                  className={`flex items-center justify-center gap-2.5 rounded-[14px] py-[15px] text-sm font-semibold text-brand-text border transition-colors duration-[180ms] ${
                    active
                      ? "border-brand-ink bg-surface-soft shadow-[inset_0_0_0_1px_var(--color-brand-ink)]"
                      : "border-brand-border bg-brand-card hover:border-brand-border-hover"
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${f.dot}`} />
                  {f.label}
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[.14em] text-brand-muted">
                Esfuerzo percibido · opcional
              </span>
              <span className="text-xs text-brand-muted tabular-nums">{rpe ? `${rpe} / 10` : "sin indicar"}</span>
            </div>
            <div className="flex gap-1.5 mt-2.5 overflow-x-auto -mx-1 px-1">
              {RPE_SCALE.map((n) => {
                const active = rpe === n;
                return (
                  <button
                    key={n}
                    onClick={() => setRpe(active ? null : n)}
                    aria-pressed={active}
                    className={`w-7 h-7 sm:w-[30px] sm:h-[30px] rounded-[9px] text-xs font-bold tabular-nums border transition-colors duration-150 shrink-0 ${
                      active
                        ? "bg-tz-black text-tz-bone border-transparent"
                        : "bg-surface-soft text-brand-muted border-brand-border hover:text-brand-text"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3.5 pt-[18px] border-t border-brand-border">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={`Añade una nota para ${trainerName ?? "tu entrenador"} (opcional)`}
              className="flex-1 min-w-0 bg-surface-soft border border-brand-border rounded-xl px-3.5 py-3 text-sm text-brand-text outline-none focus:border-brand-ink transition-colors duration-150"
            />
            <button
              onClick={submit}
              disabled={!feeling || pending}
              className="inline-flex items-center justify-center gap-2 bg-tz-black text-tz-bone rounded-full px-6 py-3.5 text-xs font-extrabold uppercase tracking-[.1em] shrink-0 transition-[opacity,transform] duration-200 active:scale-[.97] disabled:opacity-40 disabled:pointer-events-none"
            >
              {pending && <ButtonSpinner />}
              Enviar
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PostSessionFeedbackPrompts({
  items,
}: {
  items: { bookingId: string; sessionName: string; startTime: string; trainerName: string | null; sessionDate: string }[];
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const visible = items.filter((i) => !dismissed.includes(i.bookingId));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((i) => (
        <FeedbackCard
          key={i.bookingId}
          bookingId={i.bookingId}
          sessionName={i.sessionName}
          startTime={i.startTime}
          trainerName={i.trainerName}
          sessionDate={i.sessionDate}
          onDone={() => setDismissed((d) => [...d, i.bookingId])}
        />
      ))}
    </div>
  );
}
