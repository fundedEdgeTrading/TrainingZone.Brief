"use client";

import { useEffect, useState, useTransition } from "react";
import { deleteAptitudeRule } from "./actions";

export default function DeleteButton({ id }: { id: string }) {
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
        onClick={() => startTransition(() => deleteAptitudeRule(id))}
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
