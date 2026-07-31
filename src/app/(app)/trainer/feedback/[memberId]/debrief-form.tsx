"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { submitTrainerDebriefAction } from "./actions";

type DimKey = "sat" | "prog" | "adher" | "motiv" | "esf";

const DIMENSIONS: { key: DimKey; label: string; hint: string }[] = [
  { key: "sat", label: "Satisfacción", hint: "¿Cómo de satisfecho/a lo ves con el servicio?" },
  { key: "prog", label: "Progreso", hint: "¿Está avanzando hacia su objetivo?" },
  { key: "adher", label: "Adherencia", hint: "¿Cumple el plan y viene con la frecuencia esperada?" },
  { key: "motiv", label: "Motivación", hint: "¿Con qué actitud llega a las sesiones?" },
  { key: "esf", label: "Esfuerzo", hint: "¿Cuánto esfuerzo real pone en cada sesión?" },
];

const DEFAULT_DIMS: Record<DimKey, number> = { sat: 7, prog: 7, adher: 7, motiv: 7, esf: 7 };

export function TrainerDebriefForm({ memberId, memberName }: { memberId: string; memberName: string }) {
  const router = useRouter();
  const [dims, setDims] = useState<Record<DimKey, number>>(DEFAULT_DIMS);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [dragging, setDragging] = useState<DimKey | null>(null);
  const dragRef = useRef<{ key: DimKey; rect: DOMRect } | null>(null);

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
    if (!note.trim()) {
      setError("Añade una nota breve antes de enviar.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await submitTrainerDebriefAction(memberId, { ...dims, note });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="bg-brand-card border border-brand-border rounded-card p-8 flex flex-col items-center text-center gap-3.5">
        <span className="w-[64px] h-[64px] rounded-full bg-[#eef0e4] text-good flex items-center justify-center text-3xl">✓</span>
        <div className="font-display font-extrabold text-xl text-brand-text">Debrief enviado</div>
        <p className="text-sm text-brand-muted max-w-[360px]">
          Ya está disponible en /feedback para el contraste con la respuesta de {memberName}.
        </p>
        <Link
          href="/trainer"
          className="mt-2 bg-brand-ink text-tz-bone rounded-[11px] px-6 py-3 font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-brand-ink-soft transition-colors duration-150"
        >
          Volver al panel
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-brand-border rounded-card p-6 flex flex-col gap-[26px]">
      {DIMENSIONS.map(({ key, label, hint }) => (
        <div key={key}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[15px] font-bold text-brand-text">{label}</div>
              <div className="text-[12.5px] text-brand-muted mt-0.5">{hint}</div>
            </div>
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display font-extrabold leading-[.9] text-brand-text tabular-nums text-[32px]">{dims[key]}</span>
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
          Nota del periodo <span className="font-medium text-brand-muted-2">· obligatoria</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Cómo lo ves, qué ajustarías, algo que dirección debería saber..."
          className="w-full rounded-control border border-brand-border bg-white px-4 py-3 text-[14px] text-brand-text placeholder:text-faint outline-none transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-[3px] focus:ring-tz-black/[0.08] resize-none"
        />
      </div>

      {error && <p className="text-sm font-semibold text-critical">{error}</p>}

      <div className="flex items-center gap-3">
        <Link
          href="/trainer"
          className="bg-white text-brand-text-2 border border-brand-border rounded-[11px] px-5 py-[13px] font-display font-bold text-[13.5px] hover:bg-tz-bone transition-colors duration-150"
        >
          Cancelar
        </Link>
        <button
          disabled={pending}
          onClick={submit}
          className="flex-1 bg-good text-white rounded-[11px] px-[26px] py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-[#3c4a19] active:scale-[.98] transition-[background-color,transform] duration-150 disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar debrief"}
        </button>
      </div>
    </div>
  );
}
