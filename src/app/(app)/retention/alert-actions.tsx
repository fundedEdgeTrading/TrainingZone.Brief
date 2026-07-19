"use client";

import { useTransition } from "react";
import { updateAlertStatus } from "./actions";
import type { RetentionAlertStatus } from "@prisma/client";

export default function AlertActions({ alertId, status }: { alertId: string; status: RetentionAlertStatus }) {
  const [pending, startTransition] = useTransition();

  if (status !== "OPEN") {
    return (
      <span className="text-xs text-faint">
        {{ CONTACTED: "Contactada", POSTPONED: "Pospuesta", DISMISSED: "Descartada" }[status]}
      </span>
    );
  }

  function set(s: RetentionAlertStatus) {
    startTransition(() => updateAlertStatus(alertId, s));
  }

  return (
    <div className="flex gap-1">
      <button
        disabled={pending}
        onClick={() => set("CONTACTED")}
        className="text-xs bg-good-bg text-good rounded-md px-2 py-1 hover:opacity-80"
      >
        Marcar contactada
      </button>
      <button
        disabled={pending}
        onClick={() => set("POSTPONED")}
        className="text-xs bg-tz-sand text-text-2 rounded-md px-2 py-1 hover:bg-tz-linen/40"
      >
        Posponer 7d
      </button>
      <button
        disabled={pending}
        onClick={() => set("DISMISSED")}
        className="text-xs text-faint rounded-md px-2 py-1 hover:bg-tz-bone"
      >
        Descartar
      </button>
    </div>
  );
}
