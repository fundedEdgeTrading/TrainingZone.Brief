"use client";

import { useTransition } from "react";
import { updateAlertStatus } from "./actions";
import type { RetentionAlertStatus } from "@prisma/client";

export default function AlertActions({ alertId, status }: { alertId: string; status: RetentionAlertStatus }) {
  const [pending, startTransition] = useTransition();

  if (status !== "OPEN") {
    return (
      <span className="text-xs text-slate-400">
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
        className="text-xs bg-emerald-100 text-emerald-800 rounded-md px-2 py-1 hover:bg-emerald-200"
      >
        Marcar contactada
      </button>
      <button
        disabled={pending}
        onClick={() => set("POSTPONED")}
        className="text-xs bg-slate-100 text-slate-700 rounded-md px-2 py-1 hover:bg-slate-200"
      >
        Posponer 7d
      </button>
      <button
        disabled={pending}
        onClick={() => set("DISMISSED")}
        className="text-xs text-slate-400 rounded-md px-2 py-1 hover:bg-slate-100"
      >
        Descartar
      </button>
    </div>
  );
}
