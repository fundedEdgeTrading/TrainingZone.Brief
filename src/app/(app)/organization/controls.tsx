"use client";

import { useEffect, useState, useTransition } from "react";
import { removeCenterMembership } from "./actions";
import { useToast } from "@/components/ui/toast";

export function RemoveMembershipButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleRemove() {
    startTransition(async () => {
      const result = await removeCenterMembership(id);
      if (result.ok) {
        toast.success("Imputación eliminada.");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (confirming) {
    return (
      <button
        disabled={pending}
        onClick={handleRemove}
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
