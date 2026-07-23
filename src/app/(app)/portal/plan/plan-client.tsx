"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { useToast } from "@/components/ui/toast";
import { requestWorkoutProgramAction, submitSelfAssessmentAction } from "./actions";

export function RequestWorkoutButton({ hasPending }: { hasPending: boolean }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      size="sm"
      disabled={pending || hasPending}
      onClick={() =>
        startTransition(async () => {
          const result = await requestWorkoutProgramAction();
          if (result.ok) toast.success("Rutina solicitada — tu entrenador la confirmará pronto");
          else toast.error(result.error);
        })
      }
    >
      {hasPending ? "Ya tienes una rutina pendiente" : "Solicitar rutina para casa"}
    </Button>
  );
}

export function SelfAssessmentForm() {
  return (
    <ActionForm action={submitSelfAssessmentAction} successMessage="Autovaloración enviada" className="space-y-3">
      <textarea
        name="text"
        rows={3}
        placeholder="¿Cómo te sientes con tu progreso? ¿Has notado algún cambio?"
        className="w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm"
      />
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" name="stalled" />
        Siento que estoy estancado/a
      </label>
      <Button type="submit" size="sm">
        Enviar autovaloración
      </Button>
    </ActionForm>
  );
}
