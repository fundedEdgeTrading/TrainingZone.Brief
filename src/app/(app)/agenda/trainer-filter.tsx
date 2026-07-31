"use client";

import { useEffect, useRef, useState } from "react";
import { trainerColor } from "./agenda-utils";

type Trainer = { id: string; name: string };

/**
 * Filtro de entrenadores en desplegable con selección múltiple.
 *
 * Es la versión compacta de la lista de checkboxes de la barra lateral: en
 * móvil esa lista se come media pantalla, así que ahí solo se muestra este
 * botón y la rejilla se queda con todo el alto disponible.
 */
export default function TrainerFilter({
  trainers,
  visible,
  onToggle,
  onSetAll,
  className,
}: {
  trainers: Trainer[];
  visible: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSetAll: (value: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const shownCount = trainers.filter((t) => visible[t.id] !== false).length;
  const allShown = shownCount === trainers.length;

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label="Filtrar entrenadores"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-1.5 rounded-control border px-3 text-[13px] font-semibold text-brand-text transition-colors ${
          open ? "border-brand-ink bg-tz-bone" : "border-brand-border hover:bg-tz-bone"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span className="hidden sm:inline">Entrenadores</span>
        {!allShown && (
          <span className="rounded-full bg-tz-black px-1.5 py-px text-[10px] font-bold text-tz-bone">
            {shownCount}/{trainers.length}
          </span>
        )}
        <span className="text-[10px] text-muted">▾</span>
      </button>

      {open && (
        <div className="tz-select-pop absolute left-0 top-[calc(100%+6px)] z-[60] w-[236px] rounded-[13px] border border-brand-border bg-white p-1.5 shadow-pop">
          <div className="flex items-center justify-between px-2 pt-1 pb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-[.14em] text-muted">Entrenadores</span>
            <button
              type="button"
              onClick={() => onSetAll(!allShown)}
              className="text-[11px] font-semibold text-text-2 underline underline-offset-2 hover:text-brand-text"
            >
              {allShown ? "Ninguno" : "Todos"}
            </button>
          </div>
          <div className="flex max-h-[50vh] flex-col gap-0.5 overflow-y-auto">
            {trainers.map((t) => {
              const color = trainerColor(t.id);
              const isVisible = visible[t.id] !== false;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isVisible}
                  onClick={() => onToggle(t.id)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-tz-bone"
                >
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-xs text-white"
                    style={{ border: `2px solid ${color}`, background: isVisible ? color : "transparent" }}
                  >
                    {isVisible ? "✓" : ""}
                  </span>
                  <span className="truncate text-[13px] text-brand-text">{t.name}</span>
                </button>
              );
            })}
            {trainers.length === 0 && <p className="px-2 py-2 text-xs text-muted">Sin entrenadores asignables.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
