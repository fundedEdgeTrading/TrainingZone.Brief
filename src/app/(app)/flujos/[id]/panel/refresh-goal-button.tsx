"use client";

import { useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { actualizarMedicionAction } from "./actions";

/**
 * Guarda la fotografía del objetivo (`FlowEnrollment.goalMetAt`).
 *
 * No cambia la cifra que se está viendo —el panel ya la mide en vivo al
 * abrirse—: lo que hace es dejarla escrita para el resto de pantallas. El
 * rótulo lo dice para que nadie lo pulse esperando que el número suba.
 */
export function RefreshGoalButton({ flowId }: { flowId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await actualizarMedicionAction(flowId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(
            result.medidos === 0
              ? "Medición guardada. No había ninguna nueva que apuntar."
              : `Medición guardada: ${result.medidos} ${result.medidos === 1 ? "inscripción cumple" : "inscripciones cumplen"} el objetivo.`
          );
        })
      }
    >
      {pending && <ButtonSpinner />}
      Guardar la medición
    </Button>
  );
}
