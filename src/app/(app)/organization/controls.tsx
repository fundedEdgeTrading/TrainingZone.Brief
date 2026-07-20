"use client";

import { useEffect, useState, useTransition } from "react";
import { removeCenterMembership } from "./actions";

export function RemoveMembershipButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => removeCenterMembership(id))}
        className="text-[11px] font-semibold text-critical hover:opacity-80 transition-opacity"
        title="Confirmar quitar imputación"
      >
        ¿Quitar?
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => setConfirming(true)}
      className="text-faint hover:text-critical transition-colors duration-150 leading-none"
      title="Quitar imputación"
      aria-label="Quitar imputación"
    >
      ×
    </button>
  );
}
