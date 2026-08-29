"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addHealthRecord, resolveHealthRecordAction, addMemberNote, resendMemberWelcome } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useFocusRequest } from "./section-rail";
import { NOTE_SCOPE_HINT } from "./note-highlights";

// Mismas clases que el control de field.tsx, para los <textarea> multilínea.
const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";

export function AddHealthRecordForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("INJURY");
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await addHealthRecord(fd);
          if (result.ok) {
            formRef.current?.reset();
            setType("INJURY");
            toast.success("Registro de salud guardado.");
          } else {
            toast.error(result.error);
          }
        })
      }
      className="border border-brand-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end bg-brand-bg"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <Field label="Tipo">
        <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="INJURY">Lesión</option>
          <option value="CHRONIC_CONDITION">Condición crónica</option>
          <option value="MEDICATION">Medicación</option>
          <option value="SURGERY">Cirugía</option>
          <option value="PREGNANCY">Embarazo</option>
          <option value="ALLERGY">Alergia</option>
        </Select>
      </Field>
      <Field
        label="Zona"
        hint={type === "INJURY" ? "Coincide con las reglas de aptitud (p.ej. hombro derecho)" : "Solo para lesiones"}
      >
        <Input name="zone" placeholder="p.ej. hombro derecho" disabled={type !== "INJURY"} />
      </Field>
      <Field label="Descripción" className="sm:col-span-2">
        <textarea
          name="description"
          required
          rows={2}
          className={CONTROL}
          placeholder="Detalle relevante para adaptar la sesión"
        />
      </Field>
      <Field label="Severidad">
        <Select name="severity">
          <option value="LOW">Baja</option>
          <option value="MEDIUM">Media</option>
          <option value="HIGH">Alta</option>
        </Select>
      </Field>
      <div className="sm:justify-self-end">
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

export function ResolveHealthButton({ recordId, memberId }: { recordId: string; memberId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveHealthRecordAction(recordId, memberId);
      if (result.ok) {
        toast.success("Registro marcado como resuelto.");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (confirming) {
    return (
      <button
        disabled={pending}
        onClick={handleResolve}
        className="text-xs font-semibold text-good underline underline-offset-[3px] hover:opacity-80 transition-opacity"
      >
        ¿Confirmar?
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => setConfirming(true)}
      className="text-xs font-semibold text-brand-text-2 underline underline-offset-[3px] hover:text-good transition-colors duration-150"
    >
      Marcar resuelta
    </button>
  );
}

export function ResendWelcomeButton({ memberId }: { memberId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resendMemberWelcome(memberId);
          if (result.ok) toast.success("Email de bienvenida reenviado.");
          else toast.error(result.error);
        })
      }
    >
      {pending && <ButtonSpinner />}
      {pending ? "Enviando..." : "Reenviar bienvenida"}
    </Button>
  );
}

/**
 * Composer de la bitácora. La casilla «Importante» sube la nota al bloque de
 * cabecera de la ficha, donde se ve sin abrir nada — de ahí que el aviso de
 * alcance esté aquí y no en una ayuda escondida: lo que no cabe en la bitácora
 * (un diagnóstico, algo persistente) es justo lo que apetece destacar.
 */
export function AddNoteForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // "Nueva nota" de la cabecera trae aquí el foco: el composer es el mismo.
  useFocusRequest("note", () => textareaRef.current?.focus());

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await addMemberNote(fd);
          if (result.ok) {
            formRef.current?.reset();
            toast.success("Nota añadida a la bitácora.");
          } else {
            toast.error(result.error);
          }
        })
      }
      className="bg-brand-bg border border-brand-border rounded-xl p-3.5 flex flex-col gap-2.5"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <textarea
        ref={textareaRef}
        name="body"
        required
        rows={2}
        className={`${CONTROL} text-[13px]`}
        placeholder="Escribe una observación de la sesión…"
      />
      <label className="flex items-center gap-2 text-[13px] text-brand-text">
        <input type="checkbox" name="important" className="w-4 h-4" />
        Importante (se muestra arriba de la ficha antes de la sesión)
      </label>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-brand-faint">
          Visible para el equipo del centro. No se comparte con el socio.
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar nota"}
        </Button>
      </div>
      <p className="text-[11px] text-brand-muted">{NOTE_SCOPE_HINT}</p>
    </form>
  );
}
