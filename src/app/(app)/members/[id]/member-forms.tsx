"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addHealthRecord, resolveHealthRecordAction, addMemberNote, updateMemberContact, resendMemberWelcome } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

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

function fmtDate(d: string | null) {
  return d
    ? "Sí · " +
        new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
    : "No";
}

export function ContactForm({
  member,
}: {
  member: {
    id: string;
    email: string;
    phone: string | null;
    address: string | null;
    birthDate: string | null;
    emergencyContact: string | null;
    consentContractAt: string | null;
    consentHealthAt: string | null;
    consentImagesAt: string | null;
    consentMarketingAt: string | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await updateMemberContact(fd);
          if (result.ok) toast.success("Datos de contacto guardados.");
          else toast.error(result.error);
        })
      }
      className="max-w-xl"
    >
      <input type="hidden" name="memberId" value={member.id} />
      <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-muted mb-3.5">
        Datos de contacto
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <Field label="Email">
          <Input name="email" type="email" defaultValue={member.email} required />
        </Field>
        <Field label="Teléfono">
          <Input name="phone" defaultValue={member.phone ?? ""} />
        </Field>
        <Field label="Dirección" className="sm:col-span-2">
          <Input name="address" defaultValue={member.address ?? ""} />
        </Field>
        <Field label="Fecha de nacimiento">
          <Input name="birthDate" type="date" defaultValue={member.birthDate ?? ""} />
        </Field>
        <Field label="Contacto de emergencia">
          <Input name="emergencyContact" defaultValue={member.emergencyContact ?? ""} />
        </Field>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm mt-5 max-w-lg">
        <dt className="text-muted">Consentimiento contrato</dt>
        <dd className="text-tz-black">{fmtDate(member.consentContractAt)}</dd>
        <dt className="text-muted">Consentimiento datos de salud</dt>
        <dd className="text-tz-black">{fmtDate(member.consentHealthAt)}</dd>
        <dt className="text-muted">Uso de imágenes (evolución)</dt>
        <dd className="text-tz-black">{fmtDate(member.consentImagesAt)}</dd>
        <dt className="text-muted">Consentimiento marketing</dt>
        <dd className="text-tz-black">{fmtDate(member.consentMarketingAt)}</dd>
      </dl>
      <div className="mt-5">
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>
    </form>
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

export function AddNoteForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

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
