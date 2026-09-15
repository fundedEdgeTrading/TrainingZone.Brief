"use client";

import { useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { recalcTagsAction } from "./actions";

/**
 * «Recalcular ahora»: una pasada del motor a mano, para no tener que esperar al
 * cron para ver el recuento de hoy. Es idempotente, así que pulsarlo dos veces
 * seguidas no mueve nada — y eso es exactamente lo que dice el aviso.
 */
export function RecalcButton() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await recalcTagsAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          const moves = result.added + result.removed;
          toast.success(
            moves === 0
              ? "Nada que cambiar: las etiquetas ya estaban al día."
              : `${result.added} puestas y ${result.removed} retiradas.`
          );
        })
      }
    >
      {pending && <ButtonSpinner />}
      Recalcular ahora
    </Button>
  );
}
