"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addHealthRecord, resolveHealthRecordAction, addMemberNote } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";

// Mismas clases que el control de field.tsx, para los <textarea> multilínea.
const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";

export function AddHealthRecordForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("INJURY");

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          await addHealthRecord(fd);
          formRef.current?.reset();
          setType("INJURY");
        })
      }
      className="border border-tz-linen rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 items-end bg-tz-bone/40"
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

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => resolveHealthRecordAction(recordId, memberId))}
        className="text-xs font-semibold text-good hover:opacity-80 transition-opacity"
      >
        ¿Marcar resuelta?
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => setConfirming(true)}
      className="text-xs text-faint hover:text-good transition-colors duration-150"
    >
      Resolver
    </button>
  );
}

export function AddNoteForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          await addMemberNote(fd);
          formRef.current?.reset();
        })
      }
      className="space-y-2"
    >
      <input type="hidden" name="memberId" value={memberId} />
      <textarea
        name="body"
        required
        rows={3}
        className={CONTROL}
        placeholder="Añadir observación de bitácora (visible para todo el staff)..."
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Añadir a la bitácora"}
        </Button>
      </div>
    </form>
  );
}
