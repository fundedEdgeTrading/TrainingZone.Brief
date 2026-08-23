"use client";

import { useState } from "react";
import clsx from "clsx";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type ActivityEntry = {
  id: string;
  /** "22 ago" ya formateado en el servidor (el ICU de Node y el del navegador no coinciden). */
  day: string;
  /** "18:30" o null en los hechos sin hora (una nota suelta, el alta). */
  time: string | null;
  title: string;
  badges: { label: string; tone: BadgeTone }[];
  /** Punto de color del debrief: clase de fondo + etiqueta. */
  feeling: { dotClass: string; label: string } | null;
  body: string | null;
  /** "origen · autor". */
  footer: string;
  /**
   * Notas de bitácora del mismo día que la sesión: una sesión con su
   * observación es un solo hecho, no dos.
   */
  notes: { id: string; body: string; footer: string }[];
};

const PAGE = 20;

export function ActivityThread({ entries }: { entries: ActivityEntry[] }) {
  const [shown, setShown] = useState(PAGE);

  if (entries.length === 0) {
    return <p className="text-sm text-brand-muted">Todavía no hay actividad registrada para este socio.</p>;
  }

  const visible = entries.slice(0, shown);

  return (
    <div>
      {visible.map((e) => (
        <div key={e.id} className="grid grid-cols-[72px_1fr] lg:grid-cols-[96px_1fr] gap-4 py-4 border-t border-brand-subtle-2">
          <div>
            <div className="text-xs font-semibold text-brand-muted tz-nums">{e.day}</div>
            {e.time && <div className="text-[11px] text-brand-faint tz-nums">{e.time}</div>}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-brand-text">{e.title}</span>
              {e.badges.map((b) => (
                <Badge key={b.label} tone={b.tone} dot={false}>
                  {b.label}
                </Badge>
              ))}
              {e.feeling && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-brand-muted">
                  <span className={clsx("w-2 h-2 rounded-full", e.feeling.dotClass)} />
                  {e.feeling.label}
                </span>
              )}
            </div>
            {e.body && <p className="text-[13px] text-text-2 text-pretty mt-1.5 whitespace-pre-wrap">{e.body}</p>}
            <p className="text-[11px] text-brand-faint mt-1.5">{e.footer}</p>
            {e.notes.map((n) => (
              <div key={n.id} className="mt-2.5 border-l-2 border-brand-subtle-2 pl-3">
                <p className="text-[13px] text-text-2 text-pretty whitespace-pre-wrap">{n.body}</p>
                <p className="text-[11px] text-brand-faint mt-1">{n.footer}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {shown < entries.length && (
        <div className="pt-4 border-t border-brand-subtle-2">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="text-sm font-semibold text-brand-text-2 hover:text-brand-text transition-colors duration-150"
          >
            Ver {Math.min(PAGE, entries.length - shown)} hechos más ({entries.length - shown} restantes)
          </button>
        </div>
      )}
    </div>
  );
}
