"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { EditScope } from "@/lib/session-series";

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const OPTIONS: { value: EditScope; label: string; hint: string }[] = [
  {
    value: "single",
    label: "Esta sesión",
    hint: "Solo el día que estás editando. Sale de la serie como sesión suelta y el resto sigue igual.",
  },
  {
    value: "future",
    label: "Esta sesión y las posteriores",
    hint: "Desde este día en adelante. Las anteriores se quedan intactas, con sus reservas y su brief.",
  },
  {
    value: "all",
    label: "Todos los eventos",
    hint: "Incluye también las sesiones anteriores, que se reescriben con estos cambios.",
  },
];

/**
 * Alcance de una edición sobre una sesión que se repite en el tiempo.
 *
 * Una serie es UNA fila en la base de datos, así que guardar el diálogo
 * reescribía la serie entera: marcar "Prueba" en la clase del martes que viene
 * reetiquetaba también todos los martes ya dados. Antes de guardar se pregunta,
 * y por defecto se propone lo menos invasivo (solo ese día).
 */
export default function SessionScopeDialog({
  open,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
}) {
  const mounted = useMounted();
  if (!mounted || !open) return null;
  // El contenido vive en su propio componente para que el alcance elegido nazca
  // siempre en "Esta sesión": al cerrarse se desmonta y no arrastra la elección
  // de la vez anterior.
  return <ScopePicker pending={pending} onCancel={onCancel} onConfirm={onConfirm} />;
}

function ScopePicker({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean;
  onCancel: () => void;
  onConfirm: (scope: EditScope) => void;
}) {
  const [scope, setScope] = useState<EditScope>("single");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  return createPortal(
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
        if (!pending) onCancel();
      }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-5 bg-[rgba(20,20,18,.55)] backdrop-blur-[3px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Editar sesión periódica"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[460px] max-w-full bg-white rounded-[18px] border border-brand-border shadow-pop overflow-hidden [animation:tzFadeUp_.26s_var(--ease-out-soft)_both]"
      >
        <div className="px-6 sm:px-7 pt-6 pb-1">
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted">Sesión periódica</div>
          <h2 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-brand-text mt-1">
            ¿A qué sesiones aplico el cambio?
          </h2>
        </div>

        <div className="px-6 sm:px-7 py-4 flex flex-col gap-1.5" role="radiogroup" aria-label="Alcance del cambio">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 rounded-control border p-3 cursor-pointer transition-colors ${
                scope === o.value ? "border-tz-black bg-tz-bone" : "border-brand-border bg-white hover:bg-tz-bone/50"
              }`}
            >
              <input
                type="radio"
                name="session-edit-scope"
                value={o.value}
                checked={scope === o.value}
                onChange={() => setScope(o.value)}
                disabled={pending}
                className="sr-only"
              />
              <span
                aria-hidden
                className="w-[18px] h-[18px] rounded-full shrink-0 mt-0.5 flex items-center justify-center"
                style={{ border: `2px solid ${scope === o.value ? "var(--color-tz-black)" : "var(--color-muted)"}` }}
              >
                {scope === o.value && <span className="w-2.5 h-2.5 rounded-full bg-tz-black" />}
              </span>
              <span>
                <span className="block text-sm font-semibold text-brand-text">{o.label}</span>
                <span className="block text-xs text-muted mt-0.5 leading-[1.5]">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-2.5 justify-end px-6 sm:px-7 py-4 border-t border-tz-sand bg-tz-bone/40">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-[42px] px-5 rounded-control border border-brand-border bg-white text-sm font-semibold text-brand-text hover:bg-tz-bone disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(scope)}
            disabled={pending}
            className="h-[42px] px-6 rounded-control bg-tz-black text-tz-bone text-sm font-semibold hover:bg-brand-ink-soft disabled:opacity-60"
          >
            {pending ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
