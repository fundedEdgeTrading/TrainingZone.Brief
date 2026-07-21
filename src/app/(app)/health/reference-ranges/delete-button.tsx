"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteReferenceRange } from "./actions";
import { useToast } from "@/components/ui/toast";

export default function DeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteReferenceRange(id);
      if (result.ok) {
        toast.success("Rango eliminado.");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (confirming) {
    return (
      <button
        disabled={pending}
        onClick={handleDelete}
        className="text-xs font-semibold text-critical hover:opacity-80 transition-opacity"
      >
        ¿Seguro? Confirmar
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => setConfirming(true)}
      className="text-xs text-faint hover:text-critical transition-colors duration-150"
    >
      Eliminar
    </button>
  );
}
