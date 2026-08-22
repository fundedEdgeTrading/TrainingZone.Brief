"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { updateMyEmailPreferenceAction, type EmailPreferenceKind } from "./actions";

/**
 * Mismo lenguaje visual que `ConsentToggle`, pero para avisos: aquí no se
 * otorga ni se retira un consentimiento, solo se enciende o se apaga un correo.
 */
export function EmailPreferenceToggle({
  kind,
  label,
  description,
  enabled,
}: {
  kind: EmailPreferenceKind;
  label: string;
  description: string;
  enabled: boolean;
}) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      const result = await updateMyEmailPreferenceAction(kind, !on);
      if (result.ok) {
        setOn(!on);
        toast.success(on ? "Dejarás de recibir estos correos." : "Volverás a recibir estos correos.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-t border-tz-sand first:border-0 first:pt-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${on ? "bg-good" : "bg-brand-border"}`} />
          <span className="text-sm font-bold text-brand-text">{label}</span>
        </div>
        <p className="text-[12.5px] text-brand-muted mt-0.5">{description}</p>
        <p className="text-[11px] text-brand-muted-2 mt-1">{on ? "Activado" : "Desactivado"}</p>
      </div>
      <Button type="button" variant={on ? "secondary" : "primary"} disabled={pending} onClick={toggle} className="shrink-0">
        {pending ? "..." : on ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
