"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { confirmWorkoutProgramAction, completeWorkoutProgramAction } from "./workout-actions";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Por confirmar", PENDING_TRAINER: "Por confirmar", ACTIVE: "Activa", COMPLETED: "Completada" };

export function WorkoutProgramList({
  memberId,
  programs,
}: {
  memberId: string;
  programs: { id: string; status: string; createdByAI: boolean; createdAt: Date }[];
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  if (programs.length === 0) return <p className="text-sm text-brand-muted">Sin rutinas solicitadas.</p>;

  return (
    <ul className="space-y-2">
      {programs.map((p) => (
        <li key={p.id} className="flex items-center justify-between border border-brand-border rounded-lg p-3 text-sm">
          <span>
            {p.createdAt.toLocaleDateString("es-ES")} {p.createdByAI && <span className="text-xs text-brand-muted">· generada por IA</span>}
          </span>
          <div className="flex items-center gap-2">
            <Badge tone={p.status === "ACTIVE" ? "good" : p.status === "COMPLETED" ? "neutral" : "warning"}>{STATUS_LABEL[p.status]}</Badge>
            {(p.status === "DRAFT" || p.status === "PENDING_TRAINER") && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await confirmWorkoutProgramAction(p.id, memberId);
                    if (result.ok) toast.success("Rutina confirmada y activada");
                    else toast.error(result.error);
                  })
                }
              >
                Confirmar y activar
              </Button>
            )}
            {p.status === "ACTIVE" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await completeWorkoutProgramAction(p.id, memberId);
                    if (!result.ok) toast.error(result.error);
                  })
                }
              >
                Marcar completada
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
