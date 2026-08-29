"use client";

import { useRef, useState, useTransition } from "react";
import type { HealthStatus } from "@prisma/client";
import { addHealthRecord, updateHealthRecordStatusAction, addMemberNote, resendMemberWelcome } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useFocusRequest } from "./section-rail";
import { HEALTH_STATUSES, HEALTH_STATUS_HINT, HEALTH_STATUS_LABEL } from "@/lib/health-status";

// Mismas clases que el control de field.tsx, para los <textarea> multilínea.
const CONTROL =
  "w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-text placeholder:text-faint transition-[border-color,box-shadow] duration-200 focus:border-brand-ink focus:ring-2 focus:ring-tz-black/10 focus:outline-none hover:border-brand-border-hover";

export function AddHealthRecordForm({ memberId }: { memberId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("INJURY");
  // Con qué precisión se conoce la fecha de la lesión. Es un dato del socio, no
  // del formulario: casi nadie recuerda el día exacto de una molestia que
  // arrastra, y forzar un día inventado envenena el "hace X" de la ficha.
  const [precision, setPrecision] = useState("UNKNOWN");
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
            setPrecision("UNKNOWN");
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
      <Field
        label="Fecha de la lesión"
        hint="Cuándo se produjo, no cuándo se registra. De aquí sale el tiempo transcurrido de la ficha."
      >
        <Select name="injuryDatePrecision" value={precision} onChange={(e) => setPrecision(e.target.value)}>
          <option value="UNKNOWN">No se conoce</option>
          <option value="EXACT">Día exacto</option>
          <option value="MONTH">Solo mes y año</option>
        </Select>
      </Field>
      {precision !== "UNKNOWN" && (
        <Field
          label={precision === "MONTH" ? "Mes de la lesión" : "Día de la lesión"}
          className="sm:col-span-2"
          hint={precision === "MONTH" ? "El tiempo transcurrido se redondeará a meses." : undefined}
        >
          {precision === "MONTH" ? (
            <Input type="month" name="injuryMonth" required max={currentMonth()} />
          ) : (
            <Input type="date" name="injuryDate" required max={currentDay()} />
          )}
        </Field>
      )}
      <div className="sm:justify-self-end">
        <Button type="submit" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Registrar"}
        </Button>
      </div>
    </form>
  );
}

/** Hoy en el formato de `<input type="date">` / `type="month"`, para el tope `max`. */
function currentDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Fase del registro de salud. Sustituye al botón único "Marcar resuelta", que
 * solo sabía hacer un salto de los cuatro posibles: una lesión pasa por
 * rehabilitación antes de estar resuelta, y algunas se quedan en crónicas.
 *
 * Cada cambio se audita (quién y cuándo) en `lib/health-access.ts`; por eso no
 * hay paso de confirmación: volver atrás es elegir otra fase, y el rastro de lo
 * que se tocó queda igualmente.
 */
export function HealthStatusSelect({
  recordId,
  memberId,
  status,
}: {
  recordId: string;
  memberId: string;
  status: HealthStatus;
}) {
  const [pending, startTransition] = useTransition();
  // Optimista: el desplegable enseña ya la fase elegida mientras el servidor
  // revalida la ruta, en vez de saltar atrás y volver.
  const [value, setValue] = useState<HealthStatus>(status);
  const toast = useToast();

  function handleChange(next: string) {
    const target = next as HealthStatus;
    if (target === value) return;
    const previous = value;
    setValue(target);
    startTransition(async () => {
      const result = await updateHealthRecordStatusAction(recordId, memberId, target);
      if (result.ok) {
        toast.success(`Estado actualizado a "${HEALTH_STATUS_LABEL[target].toLowerCase()}".`);
      } else {
        setValue(previous);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {pending && <ButtonSpinner />}
      <Select
        name={`status-${recordId}`}
        value={value}
        disabled={pending}
        onChange={(e) => handleChange(e.target.value)}
        className="w-[188px]"
      >
        {HEALTH_STATUSES.map((s) => (
          <option key={s} value={s}>
            {HEALTH_STATUS_LABEL[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Ayuda de las fases, para no tener que adivinar qué significa cada una. */
export function HealthStatusLegend() {
  return (
    <ul className="text-[11px] text-brand-faint flex flex-col gap-0.5">
      {HEALTH_STATUSES.map((s) => (
        <li key={s}>
          <span className="font-semibold text-brand-muted">{HEALTH_STATUS_LABEL[s]}</span>: {HEALTH_STATUS_HINT[s]}
        </li>
      ))}
    </ul>
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[11px] text-brand-faint">
          Visible para el equipo del centro. No se comparte con el socio.
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar nota"}
        </Button>
      </div>
    </form>
  );
}
