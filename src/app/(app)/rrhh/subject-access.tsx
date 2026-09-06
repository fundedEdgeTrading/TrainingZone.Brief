"use client";

import { useState, useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { SubjectAccessRequest, TrainerRatingDisclosure } from "@/lib/trainer-rating-access";
import { fulfilTrainerRatingAccessAction } from "./actions";

/**
 * E10-16 · Solicitudes de acceso pendientes.
 *
 * Lo que se pinta al pulsar "Preparar la entrega" es EXACTAMENTE lo que se le
 * puede dar al entrenador: puntuación, fortalezas y áreas de mejora, sin quién
 * escribió cada una. Que dirección lo vea aquí y no tenga que recortarlo a mano
 * es lo que evita que la identidad del socio se escape en el copia y pega.
 */
export function SubjectAccessRequests({ requests }: { requests: SubjectAccessRequest[] }) {
  const [pending, startTransition] = useTransition();
  const [disclosure, setDisclosure] = useState<{ name: string; rows: TrainerRatingDisclosure[] } | null>(null);
  const toast = useToast();

  function fulfil(request: SubjectAccessRequest) {
    startTransition(async () => {
      const result = await fulfilTrainerRatingAccessAction(request.trainerUserId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDisclosure({ name: request.trainerName, rows: result.disclosure });
      toast.success("Entrega preparada y registrada en Auditoría.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {requests.map((r) => {
        return (
          <div
            key={r.id}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-brand-border rounded-xl px-4 py-3"
          >
            <div className="text-sm">
              <span className="font-semibold text-brand-text">{r.trainerName}</span>
              <span className="block text-[12.5px] text-brand-muted">
                Solicitado el {r.requestedAt.toLocaleDateString("es-ES")} · plazo del art. 12.3 hasta el{" "}
                <span className={r.late ? "text-critical font-semibold" : undefined}>
                  {r.deadline.toLocaleDateString("es-ES")}
                </span>
              </span>
            </div>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => fulfil(r)}>
              {pending && <ButtonSpinner />}
              Preparar la entrega
            </Button>
          </div>
        );
      })}

      {disclosure && (
        <div className="border border-brand-border rounded-xl bg-tz-bone px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">
            Para entregar a {disclosure.name}
          </p>
          {disclosure.rows.length === 0 ? (
            <p className="text-sm text-brand-text-2 mt-2">No hay ninguna valoración suya. También eso hay que decírselo.</p>
          ) : (
            <ul className="flex flex-col gap-2.5 mt-2 list-none p-0">
              {disclosure.rows.map((row) => (
                <li key={row.label} className="text-[12.5px] text-brand-text-2">
                  <span className="font-semibold text-brand-text">
                    {row.label} · {row.date.toLocaleDateString("es-ES")}
                    {row.score != null ? ` · ${row.score}/10` : ""}
                  </span>
                  {row.strengths && <span className="block">Fortalezas: {row.strengths}</span>}
                  {row.improvements && <span className="block">Áreas de mejora: {row.improvements}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
