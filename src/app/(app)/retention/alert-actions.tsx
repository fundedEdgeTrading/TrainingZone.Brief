"use client";

import { useState, useTransition } from "react";
import { updateAlertStatus } from "./actions";
import type { RetentionAlertStatus } from "@prisma/client";
import { Button, ButtonSpinner } from "@/components/ui/button";

export default function AlertActions({ alertId, status }: { alertId: string; status: RetentionAlertStatus }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<RetentionAlertStatus | null>(null);

  if (status !== "OPEN") {
    return (
      <span className="text-xs text-faint">
        {{ CONTACTED: "Contactada", POSTPONED: "Pospuesta", DISMISSED: "Descartada" }[status]}
      </span>
    );
  }

  function set(s: RetentionAlertStatus) {
    startTransition(async () => {
      await updateAlertStatus(alertId, s);
      setDone(s);
    });
  }

  if (done) {
    return <span className="text-xs font-semibold text-good">✓ Guardado</span>;
  }

  return (
    <div className="flex gap-1.5">
      <Button variant="secondary" size="sm" disabled={pending} onClick={() => set("CONTACTED")}>
        {pending && <ButtonSpinner />} Marcar contactada
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("POSTPONED")}>
        Posponer 7d
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("DISMISSED")} className="text-faint">
        Descartar
      </Button>
    </div>
  );
}
