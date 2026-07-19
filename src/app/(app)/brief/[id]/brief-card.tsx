"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { setDebrief } from "./actions";
import type { DebriefFeeling } from "@prisma/client";

const LIGHT_STYLE: Record<string, { emoji: string; label: string; classes: string }> = {
  RED: { emoji: "🔴", label: "Evitar bloques marcados", classes: "bg-critical-bg border-tz-linen" },
  AMBER: { emoji: "🟡", label: "Adaptar bloques marcados", classes: "bg-warning-bg border-tz-linen" },
  GREEN: { emoji: "🟢", label: "Libre, sin restricción activa", classes: "bg-good-bg border-tz-linen" },
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
}: {
  entry: RosterEntry;
  sessionId: string;
  canSeeHealth: boolean;
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
      className={`rounded-xl border p-4 flex flex-col gap-3 ${
        style ? style.classes : "bg-white border-tz-linen"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/members/${entry.member.id}`}
            className="font-semibold text-tz-black hover:underline"
          >
            {entry.member.firstName} {entry.member.lastName}
          </Link>
          <div className="flex gap-1 mt-1 flex-wrap">
            {entry.isNew && (
              <span className="text-[10px] font-medium bg-tz-sand text-text-2 rounded-full px-2 py-0.5">
                Nuevo
              </span>
            )}
            {entry.member.state === "DELINQUENT" && (
              <span className="text-[10px] font-medium bg-critical-bg text-critical rounded-full px-2 py-0.5">
                Moroso
              </span>
            )}
          </div>
        </div>
        {canSeeHealth && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-2xl leading-none"
            title={style?.label ?? "Sin restricciones conocidas"}
          >
            {style ? style.emoji : "⚪"}
          </button>
        )}
      </div>

      {canSeeHealth && expanded && (
        <div className="text-xs text-text-2 space-y-1 border-t border-black/5 pt-2">
          {entry.conditions.length === 0 && <p>Sin condiciones de salud activas registradas.</p>}
          {entry.matchedRules.map((r, i) => (
            <p key={i}>
              {LIGHT_STYLE[r.light].emoji} <strong>{r.blockArea}</strong>
              {r.adaptation ? ` — ${r.adaptation}` : ""}
            </p>
          ))}
          {entry.conditions
            .filter((c) => !c.zone)
            .map((c, i) => (
              <p key={`c-${i}`}>ℹ️ {c.description}</p>
            ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-1">
        <span className="text-xs text-muted mr-1">Debrief:</span>
        {(["GREEN", "AMBER", "RED"] as DebriefFeeling[]).map((f) => (
          <button
            key={f}
            disabled={pending}
            onClick={() => tap(f)}
            className={`h-9 w-9 rounded-full text-lg flex items-center justify-center border-2 transition ${
              feeling === f ? "border-tz-black scale-110" : "border-transparent opacity-60 hover:opacity-100"
            }`}
          >
            {{ GREEN: "🟢", AMBER: "🟡", RED: "🔴" }[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
