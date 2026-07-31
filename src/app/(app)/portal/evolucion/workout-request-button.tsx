"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestWorkoutProgramAction } from "./actions";

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
