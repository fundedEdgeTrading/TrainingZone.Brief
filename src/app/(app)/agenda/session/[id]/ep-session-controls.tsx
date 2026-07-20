"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { setSessionDirectorAction, setSessionSelfBookableAction } from "./actions";

export function DirectorSelect({
  sessionId,
  directedByUserId,
  trainers,
}: {
  sessionId: string;
  directedByUserId: string | null;
  trainers: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(directedByUserId ?? "");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted">Dirigida por:</span>
      <Select
        value={value}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          startTransition(async () => {
            const result = await setSessionDirectorAction(sessionId, next);
            if (result.ok) toast.success("Director de sesión actualizado");
            else toast.error(result.error);
          });
        }}
        className="w-auto py-1.5 text-xs"
      >
        <option value="">Sin registrar</option>
        {trainers.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function SelfBookableToggle({ sessionId, selfBookable }: { sessionId: string; selfBookable: boolean }) {
  const [checked, setChecked] = useState(selfBookable);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setChecked(next);
          startTransition(async () => {
            const result = await setSessionSelfBookableAction(sessionId, next);
            if (result.ok) toast.success(next ? "Franja autorreservable" : "Franja solo reserva manual");
            else {
              toast.error(result.error);
              setChecked(!next);
            }
          });
        }}
      />
      Autorreservable por el cliente (RB-AGENDA-002)
    </label>
  );
}
