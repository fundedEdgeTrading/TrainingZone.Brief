"use client";

import { useTransition } from "react";
import { deleteAptitudeRule } from "./actions";

export default function DeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => deleteAptitudeRule(id))}
      className="text-xs text-faint hover:text-critical"
    >
      Eliminar
    </button>
  );
}
