"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { setDebrief } from "./actions";
import type { DebriefFeeling } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const LIGHT_STYLE: Record<string, { label: string; classes: string; dot: string }> = {
  RED: { label: "Evitar bloques marcados", classes: "bg-critical-bg border-tz-linen", dot: "bg-critical" },
  AMBER: { label: "Adaptar bloques marcados", classes: "bg-warning-bg border-tz-linen", dot: "bg-warning" },
  GREEN: { label: "Libre, sin restricción activa", classes: "bg-good-bg border-tz-linen", dot: "bg-good" },
};

const FEELING_DOT: Record<DebriefFeeling, string> = { GREEN: "bg-good", AMBER: "bg-warning", RED: "bg-critical" };

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
  const [expanded, setExpanded] = useState(false);

  const style = entry.light ? LIGHT_STYLE[entry.light] : null;

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
      <div className="flex items-start justify-between gap-2">
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
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={style?.label ?? "Sin restricciones conocidas"}
            title={style?.label ?? "Sin restricciones conocidas"}
            className="w-9 h-9 rounded-full border border-brand-border flex items-center justify-center shrink-0 transition-colors duration-150 hover:bg-tz-bone"
          >
            <span className={clsx("w-3 h-3 rounded-full", style ? style.dot : "bg-neutral")} />
          </button>
        )}
      </div>

      {canSeeHealth && (
        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out-soft"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="text-xs text-text-2 space-y-1 border-t border-black/5 pt-2">
              {entry.conditions.length === 0 && entry.matchedRules.length === 0 && (
                <p>Sin condiciones de salud activas registradas.</p>
              )}
              {entry.matchedRules.map((r, i) => (
                <p key={i} className="flex items-center gap-1.5">
                  <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", LIGHT_STYLE[r.light].dot)} />
                  <strong>{r.blockArea}</strong>
                  {r.adaptation ? ` — ${r.adaptation}` : ""}
                </p>
              ))}
              {entry.conditions
                .filter((c) => !c.zone)
                .map((c, i) => (
                  <p key={`c-${i}`}>{c.description}</p>
                ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <span className="text-xs text-muted mr-1">Debrief:</span>
        <div className="inline-flex gap-1 bg-tz-sand/60 rounded-pill p-1">
          {(["GREEN", "AMBER", "RED"] as DebriefFeeling[]).map((f) => (
            <button
              key={f}
              disabled={pending}
              onClick={() => tap(f)}
              aria-label={f}
              className={clsx(
                "h-7 w-7 rounded-full flex items-center justify-center transition-[transform,background-color] duration-150 active:scale-90",
                feeling === f ? "scale-110" : "opacity-50 hover:opacity-100"
              )}
            >
              <span className={clsx("w-3 h-3 rounded-full", FEELING_DOT[f])} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
