"use client";

import { useState, useTransition } from "react";
import { submitPostSessionFeedback } from "./actions";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const FEELINGS = [
  { value: "GREEN" as const, emoji: "🟢", label: "Genial" },
  { value: "AMBER" as const, emoji: "🟡", label: "Normal" },
  { value: "RED" as const, emoji: "🔴", label: "Duro" },
];

function FeedbackCard({
  bookingId,
  sessionName,
  sessionDate,
  onDone,
}: {
  bookingId: string;
  sessionName: string;
  sessionDate: string;
  onDone: () => void;
}) {
  const [feeling, setFeeling] = useState<"GREEN" | "AMBER" | "RED" | null>(null);
  const [rpe, setRpe] = useState("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function submit() {
    if (!feeling) return;
    startTransition(async () => {
      const result = await submitPostSessionFeedback(bookingId, {
        feeling,
        rpe: rpe ? Number(rpe) : null,
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
    <div className="bg-brand-card border border-brand-border rounded-2xl px-5 py-4 tz-fade-up">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <div className="text-[15px] font-bold text-brand-text">{sessionName}</div>
          <div className="text-xs text-brand-muted">{sessionDate} · ¿Cómo te ha ido?</div>
        </div>
        <button onClick={onDone} className="text-xs text-faint hover:text-brand-text transition-colors duration-150 shrink-0">
          Omitir
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3">
        {FEELINGS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFeeling(f.value)}
            className={`flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 border transition-colors duration-150 ${
              feeling === f.value ? "border-brand-ink bg-tz-bone" : "border-brand-border bg-white hover:border-brand-border-hover"
            }`}
          >
            <span className="text-2xl leading-none">{f.emoji}</span>
            <span className="text-[11px] font-semibold text-brand-text-2">{f.label}</span>
          </button>
        ))}
      </div>
      {feeling && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <label className="text-xs text-brand-muted shrink-0">Esfuerzo percibido (RPE, opcional)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              className="w-16 rounded-md border border-brand-border px-2 py-1 text-xs"
            />
          </div>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Un comentario (opcional)"
            className="w-full rounded-control border border-brand-border px-3 py-2 text-sm"
          />
          <Button size="sm" disabled={pending} onClick={submit}>
            {pending && <ButtonSpinner />}
            Enviar
          </Button>
        </div>
      )}
    </div>
  );
}

export function PostSessionFeedbackPrompts({
  items,
}: {
  items: { bookingId: string; sessionName: string; sessionDate: string }[];
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
          sessionDate={i.sessionDate}
          onDone={() => setDismissed((d) => [...d, i.bookingId])}
        />
      ))}
    </div>
  );
}
