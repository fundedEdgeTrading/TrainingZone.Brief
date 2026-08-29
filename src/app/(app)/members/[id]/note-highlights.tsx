"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useSectionNav } from "./section-rail";
import { setMemberNoteArchivedAction, setMemberNoteImportantAction } from "./actions";

/**
 * Bloque de bitácora que va pegado a la cabecera de la ficha, más el panel de
 * archivadas y los controles de cada nota.
 *
 * Por qué arriba y no dentro del hilo: el entrenador abre la ficha justo antes
 * de la sesión y lo que necesita saber ("no le mandes remo", "el martes vino
 * con agujetas") no puede estar a diez scrolls de distancia ni depender de que
 * abra la sección Actividad. El hilo cronológico sigue siendo el archivo
 * completo; esto es la portada.
 */

export type NoteView = {
  id: string;
  body: string;
  /** "22 ago · Ana", ya formateado en el servidor. */
  footer: string;
  important: boolean;
  archived: boolean;
};

/**
 * El límite de la bitácora, dicho en la propia pantalla. Se repite en el
 * composer y aquí porque es donde se decide mal: la tentación de escribir
 * "tiene una hernia" en una nota rápida aparece justo al leer las de arriba.
 */
export const NOTE_SCOPE_HINT =
  "Para observaciones puntuales y leves del día a día. Un diagnóstico médico o algo persistente se registra como Lesión en Salud, que lleva su propio control de acceso.";

/** Botonera de una nota: destacar/quitar destacado y archivar/desarchivar. */
export function NoteActions({ note, className }: { note: NoteView; className?: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(done);
      else toast.error(result.error);
    });
  }

  return (
    <div className={clsx("flex items-center gap-3 flex-wrap", className)}>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => setMemberNoteImportantAction(note.id, !note.important),
            note.important ? "Nota sin destacar." : "Nota destacada."
          )
        }
        className="text-[11px] font-semibold text-brand-text-2 underline underline-offset-[3px] hover:text-brand-text transition-colors duration-150 disabled:opacity-50"
      >
        {note.important ? "Quitar destacado" : "Destacar"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => setMemberNoteArchivedAction(note.id, !note.archived),
            note.archived ? "Nota recuperada." : "Nota archivada."
          )
        }
        className="text-[11px] font-semibold text-brand-text-2 underline underline-offset-[3px] hover:text-brand-text transition-colors duration-150 disabled:opacity-50"
      >
        {note.archived ? "Desarchivar" : "Archivar"}
      </button>
    </div>
  );
}

/**
 * Portada de la bitácora: las destacadas (no caducan) y las recientes sin
 * archivar. Si no hay ninguna no se pinta nada — una caja vacía en la cabecera
 * de todas las fichas sería ruido permanente.
 */
export function MemberNoteHighlights({ notes }: { notes: NoteView[] }) {
  const nav = useSectionNav();
  if (notes.length === 0) return null;

  return (
    <section
      aria-label="Notas destacadas y recientes"
      className="bg-brand-card border border-brand-border rounded-card shadow-card p-5"
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-brand-faint">
          Antes de la sesión
        </h2>
        <button
          type="button"
          onClick={() => nav.go("actividad")}
          className="text-[11px] font-semibold text-brand-text-2 underline underline-offset-[3px] hover:text-brand-text transition-colors duration-150"
        >
          Ver toda la bitácora
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2.5">
        {notes.map((n) => (
          <li
            key={n.id}
            className={clsx(
              "rounded-xl border p-[13px_14px]",
              n.important ? "border-warning-bg bg-warning-bg" : "border-brand-subtle-2 bg-brand-bg"
            )}
          >
            {n.important && (
              <Badge tone="warning" dot={false} className="mb-1.5">
                Importante
              </Badge>
            )}
            <p className="text-[13px] text-brand-text text-pretty whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
              <span className="text-[11px] text-brand-faint">{n.footer}</span>
              <NoteActions note={n} />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-brand-muted mt-3">{NOTE_SCOPE_HINT}</p>
    </section>
  );
}

/**
 * Notas archivadas. Plegado por defecto: están fuera del hilo precisamente
 * porque ya no hacen falta a diario, pero siguen siendo consultables — archivar
 * nunca borra.
 */
export function ArchivedNotes({ notes }: { notes: NoteView[] }) {
  const [open, setOpen] = useState(false);
  if (notes.length === 0) return null;

  return (
    <div className="border border-brand-subtle-2 rounded-xl p-[13px_14px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-[12px] font-semibold text-brand-text-2 hover:text-brand-text transition-colors duration-150"
      >
        {open ? "Ocultar" : "Ver"} notas archivadas ({notes.length})
      </button>

      {open && (
        <ul className="mt-3 flex flex-col gap-3">
          {notes.map((n) => (
            <li key={n.id} className="border-l-2 border-brand-subtle-2 pl-3">
              <p className="text-[13px] text-text-2 text-pretty whitespace-pre-wrap">{n.body}</p>
              <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
                <span className="text-[11px] text-brand-faint">{n.footer}</span>
                <NoteActions note={n} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
