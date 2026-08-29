"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setCustomQuestionActiveAction, setQuestionEnabledAction } from "./actions";

/**
 * Interruptor de una pregunta del cuestionario estándar. Las bloqueadas se
 * pintan igual pero apagadas y con el motivo a la vista: enseñar por qué no se
 * pueden quitar evita la llamada al soporte preguntando dónde está el botón.
 */
export function QuestionToggle({
  questionKey,
  label,
  enabled,
  locked,
}: {
  questionKey: string;
  label: string;
  enabled: boolean;
  locked?: string;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      const result = await setQuestionEnabledAction(questionKey, !on);
      if (result.ok) {
        setOn(!on);
        toast.success(on ? "La pregunta deja de hacerse." : "La pregunta vuelve al cuestionario.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-tz-sand first:border-0 first:pt-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${locked || on ? "bg-good" : "bg-brand-border"}`} />
          <span className="text-sm font-semibold text-brand-text">{label}</span>
        </div>
        {locked && <p className="text-[12px] text-brand-muted mt-0.5 ml-4">Siempre se pregunta · {locked}</p>}
      </div>
      {locked ? (
        <span className="text-xs text-brand-muted-2 shrink-0">Fija</span>
      ) : (
        <Button
          type="button"
          variant={on ? "secondary" : "primary"}
          disabled={pending}
          onClick={toggle}
          className="shrink-0"
          // El nombre visible se repite en todas las filas; el accesible dice de
          // qué pregunta se está hablando.
          aria-label={`${on ? "Quitar" : "Añadir"} ${label}`}
        >
          {pending ? "..." : on ? "Quitar" : "Añadir"}
        </Button>
      )}
    </div>
  );
}

/** Retirar o reponer una pregunta propia del centro. Nunca borra respuestas. */
export function CustomQuestionToggle({ id, label, active }: { id: string; label: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      variant={on ? "secondary" : "primary"}
      size="sm"
      disabled={pending}
      aria-label={`${on ? "Retirar" : "Reponer"} ${label}`}
      onClick={() =>
        startTransition(async () => {
          const result = await setCustomQuestionActiveAction(id, !on);
          if (result.ok) {
            setOn(!on);
            toast.success(on ? "La pregunta deja de hacerse." : "La pregunta vuelve al cuestionario.");
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {on ? "Retirar" : "Reponer"}
    </Button>
  );
}
