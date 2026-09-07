"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { setDebrief, loadClinicalDetail, type ClinicalDetailEntry } from "./actions";
import type { DebriefFeeling } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { conditionLabel } from "@/lib/aptitude-light";
import type { BriefCondition, BriefRule } from "@/lib/brief-queries";

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
  conditions: BriefCondition[];
  matchedRules: BriefRule[];
  /** Declarado sin regla que lo traduzca: es lo que enciende el ámbar (E3-03). */
  unmatchedConditions: BriefCondition[];
  light: string | null;
  debrief: { feeling: DebriefFeeling; note: string | null } | null;
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
  // E3-07: el debrief es color MÁS una frase opcional. La frase no bloquea el
  // flujo de sala: se guarda al salir del campo, y el color va por su cuenta.
  const [note, setNote] = useState(entry.debrief?.note ?? "");
  // E3-05: el detalle clínico no viene con la tarjeta. Se pide, y pedirlo deja
  // rastro en AuditLog.
  const [detail, setDetail] = useState<ClinicalDetailEntry[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const toast = useToast();

  const style = entry.light ? LIGHT_STYLE[entry.light] : null;

  function openDetail() {
    setLoadingDetail(true);
    startTransition(async () => {
      const result = await loadClinicalDetail(entry.bookingId, sessionId);
      setLoadingDetail(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDetail(result.entries);
    });
  }

  function tap(f: DebriefFeeling) {
    const previous = feeling;
    setFeeling(f);
    startTransition(async () => {
      const result = await setDebrief(entry.bookingId, sessionId, f, note);
      if (!result.ok) {
        setFeeling(previous);
        toast.error(result.error);
      }
    });
  }

  function saveNote() {
    // Sin color todavía no hay debrief que anotar: la frase espera al toque.
    if (!feeling || note === (entry.debrief?.note ?? "")) return;
    startTransition(async () => {
      const result = await setDebrief(entry.bookingId, sessionId, feeling, note);
      if (!result.ok) toast.error(result.error);
    });
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
            // E3-03: a partir de ahora significa lo que dice — no hay NADA
            // declarado. Una condición sin regla enciende ámbar, no esto.
            <Badge tone="neutral">Sin restricciones</Badge>
          )}
          {(entry.matchedRules.length > 0 || entry.unmatchedConditions.length > 0) && (
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
              {entry.unmatchedConditions.map((c, i) => (
                <p key={`c-${i}`} className="flex items-center gap-1.5">
                  <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", LIGHT_STYLE.AMBER.dot)} />
                  <span>
                    <strong>{conditionLabel(c)}</strong> — condición declarada sin regla asignada
                  </span>
                </p>
              ))}
            </div>
          )}
          {entry.light !== null &&
            (detail ? (
              <div className="text-xs text-text-2 space-y-1 border-t border-black/5 pt-1.5">
                {detail.length === 0 ? (
                  <p className="text-faint">Sin detalle registrado.</p>
                ) : (
                  detail.map((d, i) => (
                    <p key={`d-${i}`}>
                      <strong>{d.label}</strong> — {d.description}{" "}
                      <span className="text-faint">({d.status})</span>
                    </p>
                  ))
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={openDetail}
                disabled={loadingDetail}
                className="text-xs underline text-muted hover:text-tz-black disabled:opacity-60"
              >
                {loadingDetail ? "Abriendo…" : "Ver detalle clínico"}
              </button>
            ))}
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
        <input
          type="text"
          value={note}
          maxLength={600}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          placeholder="Una frase, si hace falta (opcional)"
          aria-label={`Nota del debrief de ${entry.member.firstName} ${entry.member.lastName}`}
          className="w-full h-8 rounded-control border border-tz-linen bg-white/70 px-2.5 text-xs text-brand-text placeholder:text-faint focus:border-brand-ink focus:outline-none"
        />
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
