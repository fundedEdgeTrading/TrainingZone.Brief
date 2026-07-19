"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { setDebrief } from "./actions";
import type { DebriefFeeling } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const LIGHT_STYLE: Record<string, { label: string; tone: BadgeTone; classes: string; dot: string }> = {
  RED: { label: "Evitar bloques marcados", tone: "critical", classes: "bg-critical-bg border-tz-linen", dot: "bg-critical" },
  AMBER: { label: "Adaptar bloques marcados", tone: "warning", classes: "bg-warning-bg border-tz-linen", dot: "bg-warning" },
  GREEN: { label: "Libre, sin restricción activa", tone: "good", classes: "bg-good-bg border-tz-linen", dot: "bg-good" },
};

const FEELING_STYLE: Record<DebriefFeeling, { label: string; dot: string; selected: string }> = {
  GREEN: { label: "Bien", dot: "bg-good", selected: "bg-good-bg text-good border-good/40" },
  AMBER: { label: "Regular", dot: "bg-warning", selected: "bg-warning-bg text-warning-text border-warning/40" },
  RED: { label: "Mal", dot: "bg-critical", selected: "bg-critical-bg text-critical border-critical/40" },
};

type RosterEntry = {
  bookingId: string;
  member: { id: string; firstName: string; lastName: string; state: string };
  isNew: boolean;
  conditions: { zone: string | null; description: string; type: string }[];
  matchedRules: { injuryZone: string; blockArea: string; light: string; adaptation: string | null }[];
  light: string | null;
  debrief: { feeling: DebriefFeeling } | null;
};

export default function BriefCard({
  entry,
  sessionId,
  canSeeHealth,
  delay = 0,
}: {
  entry: RosterEntry;
  sessionId: string;
  canSeeHealth: boolean;
  delay?: number;
}) {
  const [pending, startTransition] = useTransition();
  const [feeling, setFeeling] = useState<DebriefFeeling | null>(entry.debrief?.feeling ?? null);

  const style = entry.light ? LIGHT_STYLE[entry.light] : null;
  const otherConditions = entry.conditions.filter((c) => !c.zone);

  function tap(f: DebriefFeeling) {
    setFeeling(f);
    startTransition(() => setDebrief(entry.bookingId, sessionId, f));
  }

  return (
    <div
      className={clsx(
        "rounded-card border p-4 flex flex-col gap-3 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-hover tz-fade-up",
        style ? style.classes : "bg-white border-tz-linen"
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      <div>
        <Link href={`/members/${entry.member.id}`} className="font-semibold text-tz-black hover:underline">
          {entry.member.firstName} {entry.member.lastName}
        </Link>
        <div className="flex gap-1 mt-1 flex-wrap">
          {entry.isNew && <Badge tone="trial">Nuevo</Badge>}
          {entry.member.state === "DELINQUENT" && <Badge tone="critical">Moroso</Badge>}
        </div>
      </div>

      {canSeeHealth && (
        <div className="space-y-1.5">
          {style ? (
            <Badge tone={style.tone}>{style.label}</Badge>
          ) : (
            <Badge tone="neutral">Sin restricciones</Badge>
          )}
          {(entry.matchedRules.length > 0 || otherConditions.length > 0) && (
            <div className="text-xs text-text-2 space-y-1">
              {entry.matchedRules.map((r, i) => (
                <p key={i} className="flex items-center gap-1.5">
                  <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", LIGHT_STYLE[r.light].dot)} />
                  <span>
                    <strong>{r.blockArea}</strong>
                    {r.adaptation ? ` — ${r.adaptation}` : ""}
                  </span>
                </p>
              ))}
              {otherConditions.map((c, i) => (
                <p key={`c-${i}`}>{c.description}</p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-auto pt-2 border-t border-black/5 space-y-1.5">
        <div className="text-xs font-semibold text-text-2">¿Cómo ha ido la sesión?</div>
        <div className="flex gap-1.5" role="group" aria-label={`Debrief de ${entry.member.firstName} ${entry.member.lastName}`}>
          {(["GREEN", "AMBER", "RED"] as DebriefFeeling[]).map((f) => {
            const fs = FEELING_STYLE[f];
            const selected = feeling === f;
            return (
              <button
                key={f}
                disabled={pending}
                onClick={() => tap(f)}
                aria-pressed={selected}
                className={clsx(
                  "flex-1 h-8 rounded-control border inline-flex items-center justify-center gap-1.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
                  selected
                    ? fs.selected
                    : "bg-white/70 border-tz-linen text-muted hover:text-tz-black hover:border-brand-border-hover"
                )}
              >
                <span className={clsx("w-2 h-2 rounded-full shrink-0", fs.dot)} />
                {fs.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-faint" aria-live="polite">
          {pending
            ? "Guardando…"
            : feeling
              ? "✓ Debrief guardado · asistencia marcada"
              : "Un toque guarda el debrief y marca la asistencia."}
        </p>
      </div>
    </div>
  );
}
