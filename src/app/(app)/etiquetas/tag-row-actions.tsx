"use client";

import { useState, useTransition } from "react";

import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { TAG_LABEL_MAX } from "@/lib/tags";
import { renameTagAction, setTagActiveAction } from "./actions";

/**
 * Renombrar y desactivar una etiqueta MANUAL.
 *
 * No hay botón de borrar, y no es un olvido: una etiqueta borrada se lleva por
 * delante el histórico de los flujos que la usaron —el panel de un flujo ya no
 * podría explicar por qué entró un socio—, así que lo que se apaga es su
 * capacidad de segmentar, no su rastro. Las automáticas no traen ninguno de los
 * dos controles: de ellas manda el motor.
 */
export function TagRowActions({ id, label, active }: { id: string; label: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const toast = useToast();

  function rename() {
    startTransition(async () => {
      const result = await renameTagAction(id, draft);
      if (result.ok) {
        toast.success("Etiqueta renombrada.");
        setEditing(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggle() {
    startTransition(async () => {
      const result = await setTagActiveAction(id, !active);
      if (result.ok) toast.success(active ? "Etiqueta desactivada." : "Etiqueta reactivada.");
      else toast.error(result.error);
    });
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          autoFocus
          maxLength={TAG_LABEL_MAX}
          aria-label="Nuevo rótulo"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-8 py-1 text-xs w-44"
        />
        <button disabled={pending} onClick={rename} className="text-xs font-semibold text-brand-text-2 hover:opacity-80">
          Guardar
        </button>
        <button
          disabled={pending}
          onClick={() => {
            setDraft(label);
            setEditing(false);
          }}
          className="text-xs text-faint hover:text-brand-text-2"
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 justify-end">
      <button
        disabled={pending}
        onClick={() => setEditing(true)}
        className="text-xs text-faint hover:text-brand-text-2 transition-colors duration-150"
      >
        Renombrar
      </button>
      <button
        disabled={pending}
        onClick={toggle}
        className="text-xs text-faint hover:text-brand-text-2 transition-colors duration-150"
        title={
          active
            ? "Deja de segmentar, pero no se borra: el histórico de los flujos que la usaron se conserva."
            : "Vuelve a estar disponible para etiquetar socios."
        }
      >
        {active ? "Desactivar" : "Reactivar"}
      </button>
    </div>
  );
}
