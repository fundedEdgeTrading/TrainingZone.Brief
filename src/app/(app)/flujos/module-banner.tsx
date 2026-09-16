"use client";

import Link from "next/link";
import { useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setFlowsPausedAction } from "./actions";

/**
 * REGLA 4 · La banda de pausa global.
 *
 * SE VE DESDE CUALQUIER PANTALLA DEL MÓDULO porque se pinta en el layout de
 * `/flujos`, no en la página del listado: dirección tiene que saber que está
 * pausado también cuando está mirando un flujo suelto o montando uno nuevo. Un
 * módulo pausado que no lo dice es peor que uno encendido.
 *
 * Y dice lo que más importa: LO ENCOLADO NO SE PIERDE.
 */
export function FlowsModuleBanner({
  pausedAt,
  queued,
  canPause,
  testEmail,
}: {
  pausedAt: string | null;
  queued: number;
  canPause: boolean;
  testEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const toggle = (paused: boolean) =>
    startTransition(async () => {
      const result = await setFlowsPausedAction(paused);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        paused
          ? "Flujos pausados. Lo encolado se queda donde estaba."
          : "Flujos reanudados. La cola sigue por donde iba."
      );
    });

  if (pausedAt) {
    return (
      <div
        data-testid="flujos-pausa"
        className="rounded-card border border-critical bg-critical-bg px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
      >
        <div>
          <div className="font-display font-bold text-[12px] tracking-[.14em] uppercase text-critical">
            Flujos pausados
          </div>
          <p className="text-[13px] text-brand-ink mt-1">
            No sale ni un correo de ningún flujo.{" "}
            {queued === 0
              ? "No hay nada esperando en la cola."
              : `${queued} ${queued === 1 ? "socio sigue" : "socios siguen"} en cola y ${queued === 1 ? "se reanudará" : "se reanudarán"} donde estaban: no se pierde nada.`}
          </p>
        </div>
        {canPause && (
          <Button size="sm" disabled={pending} onClick={() => toggle(false)}>
            {pending && <ButtonSpinner />}
            Reanudar
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-brand-border bg-brand-card px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
      <p className="text-[13px] text-brand-muted">
        {queued === 0 ? "No hay nadie en cola ahora mismo." : `${queued} en cola.`}{" "}
        Un flujo en borrador se ejecuta de verdad, pero todo lo que mande va a{" "}
        {testEmail ? (
          <strong className="text-brand-ink">{testEmail}</strong>
        ) : (
          <Link href="/flujos" className="underline">
            un email de pruebas que todavía no has configurado
          </Link>
        )}
        .
      </p>
      {canPause && (
        <Button variant="secondary" size="sm" disabled={pending} onClick={() => toggle(true)}>
          {pending && <ButtonSpinner />}
          Pausar todo
        </Button>
      )}
    </div>
  );
}
