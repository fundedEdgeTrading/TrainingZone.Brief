"use client";

import { useState, useTransition } from "react";

import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { AI_LITERACY_POINTS, MESOCYCLE_AI_CLASSIFICATION } from "@/lib/ai/ai-act";
import { acknowledgeAiLiteracyAction } from "../members/[id]/mesociclos/actions";

/**
 * E10-17 · Art. 4 del Reglamento de IA: alfabetización de quien opera el
 * sistema, exigible desde el 2/2/2025 y también para el responsable del
 * despliegue.
 *
 * No es un curso: son los seis puntos que separan usar la herramienta de
 * creerle. Aceptarlos deja constancia con nombre, fecha y versión en
 * `AuditLog`, que es append-only — la constancia no se retoca después.
 */
export function AiLiteracyCard({ acknowledgedAt }: { acknowledgedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(acknowledgedAt);
  const toast = useToast();

  function acknowledge() {
    startTransition(async () => {
      const result = await acknowledgeAiLiteracyAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setDone(new Date().toISOString());
      toast.success("Constancia registrada.");
    });
  }

  return (
    <div className="rounded-2xl p-[22px] bg-brand-card border border-brand-border tz-fade-up">
      <h3 className="font-display font-extrabold text-base uppercase tracking-[.01em] text-brand-text mb-2">
        Trabajar con la IA
      </h3>
      <p className="text-sm text-brand-text-2 leading-relaxed">
        Generar un mesociclo con IA es operar un sistema de inteligencia artificial, y el art. 4 del Reglamento de IA
        exige que conste tu formación para hacerlo. El sistema está clasificado como{" "}
        <b>riesgo {MESOCYCLE_AI_CLASSIFICATION.riskLevel}</b> ({MESOCYCLE_AI_CLASSIFICATION.classifiedOn}); el análisis
        razonado está en <code className="text-[12px]">{MESOCYCLE_AI_CLASSIFICATION.document}</code>.
      </p>

      <ul className="flex flex-col gap-2 mt-3.5 pl-0 list-none">
        {AI_LITERACY_POINTS.map((point) => (
          <li key={point} className="flex gap-2.5 text-[12.5px] leading-snug text-brand-text-2">
            <span className="w-1.5 h-1.5 rounded-full bg-apta-gold shrink-0 mt-[6px]" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {done ? (
          <p className="text-[12.5px] text-brand-muted">
            Constancia registrada el {new Date(done).toLocaleDateString("es-ES")}. Si el contenido cambia, se te
            volverá a pedir.
          </p>
        ) : (
          <Button type="button" variant="secondary" disabled={pending} onClick={acknowledge}>
            {pending && <ButtonSpinner />}
            He leído y entiendo estos puntos
          </Button>
        )}
      </div>
    </div>
  );
}
