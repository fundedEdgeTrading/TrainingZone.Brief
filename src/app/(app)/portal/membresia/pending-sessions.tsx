"use client";

import { useState } from "react";
import { SessionRatingModal, initials } from "./session-rating-modal";

export type PendingSession = {
  bookingId: string;
  sessionName: string;
  dateLabel: string;
  time: string;
  focus: string;
  trainerName: string | null;
  meta: string;
};

export function PendingSessionsRating({ pending }: { pending: PendingSession[] }) {
  // Snapshot de la sesión clicada (no una búsqueda derivada de `pending`): al
  // enviar la valoración, `router.refresh()` renueva `pending` sin esa sesión
  // y perdería el modal a mitad de la pantalla de confirmación si dependiera
  // de seguir encontrándola en la lista.
  const [active, setActive] = useState<PendingSession | null>(null);

  return (
    <div className="tz-fade-up" style={{ animationDelay: "0.06s" }}>
      <div className="flex items-center gap-3 mb-3.5">
        <h3 className="font-display font-extrabold text-[17px] uppercase tracking-[.01em] text-brand-text">
          Valora tus sesiones
        </h3>
        {pending.length > 0 && (
          <span className="inline-flex items-center gap-1.5 bg-critical text-white rounded-full px-[11px] py-1 text-[11px] font-extrabold uppercase tracking-[.04em]">
            {pending.length} pendientes
          </span>
        )}
        <span className="flex-1 h-px bg-[#e0d9cb]" />
        <span className="text-[12.5px] font-semibold text-brand-muted hidden sm:inline">
          Puntúa a tu entrenador y evalúate · 30 segundos
        </span>
      </div>

      {pending.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {pending.map((p) => (
            <div
              key={p.bookingId}
              className="relative overflow-hidden bg-brand-card border border-brand-border rounded-[18px] px-5 pt-5 pb-[18px] flex flex-col transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:shadow-[0_16px_34px_-18px_rgba(29,29,28,.32)] hover:border-brand-border-hover"
            >
              <span
                className="absolute top-0 left-0 w-full h-[3px]"
                style={{ background: "linear-gradient(90deg,#4b5a22,#c8ab72)" }}
              />
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-xs font-bold tracking-[.06em] uppercase text-brand-muted">
                  {p.dateLabel} · {p.time}
                </span>
                <span className="text-[11px] font-bold rounded-full px-2.5 py-1 bg-[#eef0e4] text-good">{p.focus}</span>
              </div>
              <div className="font-display font-extrabold text-xl text-brand-text mt-3.5 tracking-[-.01em]">
                {p.sessionName}
              </div>
              <div className="flex items-center gap-2.5 mt-2">
                <span className="w-7 h-7 rounded-full bg-brand-ink text-tz-bone flex items-center justify-center text-[11px] font-extrabold shrink-0">
                  {p.trainerName ? initials(p.trainerName) : "—"}
                </span>
                <span className="text-[13.5px] font-semibold text-brand-text-2">
                  {p.trainerName ?? "Sin entrenador asignado"}
                </span>
              </div>
              <button
                onClick={() => setActive(p)}
                className="mt-[18px] bg-brand-ink text-tz-bone rounded-[11px] px-[18px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] flex items-center justify-center gap-2 hover:bg-brand-ink-soft active:scale-[.98] transition-[background-color,transform] duration-150"
              >
                Valorar sesión <span className="text-base">→</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-brand-card border border-dashed border-[#d0c7b4] rounded-[18px] p-[34px] flex flex-col items-center text-center gap-2">
          <span className="w-[54px] h-[54px] rounded-full bg-[#eef0e4] text-good flex items-center justify-center text-2xl">
            ✓
          </span>
          <div className="font-display font-extrabold text-[17px] text-brand-text">¡Todo valorado!</div>
          <p className="text-[13.5px] text-brand-muted max-w-[360px] leading-[1.5]">
            Has puntuado todas tus sesiones recientes. Tu entrenador ya tiene tu feedback.
          </p>
        </div>
      )}

      <SessionRatingModal session={active} onClose={() => setActive(null)} />
    </div>
  );
}
