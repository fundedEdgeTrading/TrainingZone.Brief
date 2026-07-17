"use client";

import { useTransition } from "react";
import { deleteAptitudeRule } from "./actions";

export default function DeleteButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => deleteAptitudeRule(id))}
      className="text-xs text-slate-400 hover:text-red-600"
    >
      Eliminar
    </button>
  );
}
