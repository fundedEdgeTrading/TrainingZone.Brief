"use client";

import { useState, useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { requestOwnTrainerRatingsAction } from "./actions";

/**
 * E10-16 · Lo que ve el entrenador.
 *
 * Deliberadamente NO enseña ninguna valoración: la pantalla sigue siendo de
 * dirección. Lo que enseña es el camino —que hasta ahora no existía— y en qué
 * plazo tienen que contestarle.
 */
export function SubjectAccessCard({
  status,
}: {
  status: { requestedAt: string; deadline: string; fulfilledAt: string | null } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(status);
  const toast = useToast();

  function request() {
    startTransition(async () => {
      const result = await requestOwnTrainerRatingsAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCurrent({ requestedAt: new Date().toISOString(), deadline: result.deadline, fulfilledAt: null });
      toast.success("Solicitud presentada. Dirección tiene un mes para atenderla.");
    });
  }

  const open = current != null && current.fulfilledAt == null;

  return (
    <div className="rounded-2xl p-[22px] bg-brand-card border border-brand-border tz-fade-up">
      <h3 className="font-display font-extrabold text-base uppercase tracking-[.01em] text-brand-text mb-2">
        Tus valoraciones
      </h3>
      <p className="text-sm text-brand-text-2 leading-relaxed">
        Los socios pueden valorar tu trabajo. Esas valoraciones son confidenciales para el equipo y no se enseñan
        aquí, pero <b>son dato tuyo</b>: puedes pedir una copia (art. 15 RGPD). Recibirás la puntuación, las
        fortalezas y las áreas de mejora; no quién escribió cada una, que es lo que protege el art. 15.4.
      </p>

      {current && (
        <p className="text-[12.5px] text-brand-muted mt-3">
          Solicitud presentada el {new Date(current.requestedAt).toLocaleDateString("es-ES")}.{" "}
          {current.fulfilledAt
            ? `Atendida el ${new Date(current.fulfilledAt).toLocaleDateString("es-ES")}.`
            : `Dirección tiene hasta el ${new Date(current.deadline).toLocaleDateString("es-ES")} para atenderla.`}
        </p>
      )}

      <div className="mt-4">
        <Button type="button" variant="secondary" disabled={pending || open} onClick={request}>
          {pending && <ButtonSpinner />}
          {open ? "Solicitud en curso" : "Pedir una copia de mis valoraciones"}
        </Button>
      </div>
    </div>
  );
}
