"use client";

import Link from "next/link";
import { useTransition } from "react";

import type { FlowStatus } from "@prisma/client";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setFlowStatusAction } from "./actions";

/**
 * Borrador → activo → pausado, desde la fila.
 *
 * Activar NO es un botón más: es el gesto con el que un flujo deja de escribir
 * al buzón de pruebas y empieza a escribir a socios de verdad. Por eso el
 * servidor revalida el flujo entero antes de encenderlo (`setFlowStatus`) y por
 * eso el rótulo lo dice.
 */
export function FlowRowActions({ id, status }: { id: string; status: FlowStatus }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const change = (next: FlowStatus, message: string) =>
    startTransition(async () => {
      const result = await setFlowStatusAction(id, next);
      if (result.ok) toast.success(message);
      else toast.error(result.error);
    });

  return (
    <div className="flex items-center justify-end gap-2">
      <Link href={`/flujos/${id}`} className="text-[13px] underline text-brand-muted hover:text-brand-ink">
        Abrir
      </Link>
      {status !== "ACTIVE" && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => change("ACTIVE", "Flujo activo: a partir de ahora escribe a socios de verdad.")}
        >
          {pending && <ButtonSpinner />}
          Activar
        </Button>
      )}
      {status === "ACTIVE" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => change("PAUSED", "Flujo pausado. Lo encolado no se pierde.")}
        >
          {pending && <ButtonSpinner />}
          Pausar
        </Button>
      )}
      {status === "PAUSED" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => change("DRAFT", "Vuelve a borrador: sus envíos irán al email de pruebas.")}
        >
          A borrador
        </Button>
      )}
    </div>
  );
}
