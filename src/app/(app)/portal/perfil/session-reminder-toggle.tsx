"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { updateMySessionReminderPreferenceAction } from "./actions";

/**
 * E5-03: preferencia de recordatorios de sesión (24h/2h), independiente del
 * resto de correo comercial — mismo lenguaje visual que `EmailPreferenceToggle`.
 */
export function SessionReminderToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      const result = await updateMySessionReminderPreferenceAction(!on);
      if (result.ok) {
        setOn(!on);
        toast.success(on ? "Dejarás de recibir recordatorios de sesión." : "Volverás a recibir recordatorios de sesión.");
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
          <span className="text-sm font-bold text-brand-text">Recordatorios de sesión (24h y 2h antes)</span>
        </div>
        <p className="text-[12.5px] text-brand-muted mt-0.5">
          Aviso de tu próxima sesión con enlace de cancelación. Es un correo de servicio, no de marketing.
        </p>
        <p className="text-[11px] text-brand-muted-2 mt-1">{on ? "Activado" : "Desactivado"}</p>
      </div>
      <Button type="button" variant={on ? "secondary" : "primary"} disabled={pending} onClick={toggle} className="shrink-0">
        {pending ? "..." : on ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
