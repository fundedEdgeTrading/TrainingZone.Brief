"use client";

import { useState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import { submitPublicLead } from "./actions";

export function PublicLeadForm({
  orgSlug,
  centerSlug,
  channels,
}: {
  orgSlug: string;
  centerSlug: string;
  channels: { id: string; label: string }[];
}) {
  const [sent, setSent] = useState(false);
  const [hasTrained, setHasTrained] = useState(false);

  if (sent) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full bg-tz-black text-tz-bone flex items-center justify-center mx-auto text-2xl">✓</div>
        <h2 className="font-display font-extrabold text-xl uppercase mt-4 text-brand-text">¡Gracias!</h2>
        <p className="text-sm text-brand-text-2 mt-2">
          Hemos recibido tus datos. Un entrenador se pondrá en contacto contigo muy pronto.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      className="space-y-4"
      successMessage="Solicitud enviada"
      action={(fd) => submitPublicLead(orgSlug, centerSlug, fd).then((r) => {
        if (r.ok) setSent(true);
        return r;
      })}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nombre">
          <Input name="firstName" required placeholder="Tu nombre" />
        </Field>
        <Field label="Apellidos">
          <Input name="lastName" required placeholder="Tus apellidos" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Teléfono" hint="Para confirmarte la cita y recuperar el acceso">
          <Input name="phone" required placeholder="600 000 000" />
        </Field>
        <Field label="Email (opcional)">
          <Input name="email" type="email" placeholder="tu@email.com" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Código postal">
          <Input name="postalCode" required pattern="\d{5}" maxLength={5} placeholder="28001" />
        </Field>
        <Field label="¿A qué te dedicas?">
          <Input name="occupation" required placeholder="Tu ocupación" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="¿Tienes hijos? (opcional)">
          <Select name="hasChildren" defaultValue="">
            <option value="">Prefiero no decirlo</option>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Sexo (opcional)">
          <Select name="sex" defaultValue="">
            <option value="">Prefiero no decirlo</option>
            <option value="FEMALE">Mujer</option>
            <option value="MALE">Hombre</option>
            <option value="OTHER">Otro</option>
          </Select>
        </Field>
      </div>
      <Field label="¿Cuáles son tus objetivos?">
        <textarea name="goals" required rows={3} className="w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm" placeholder="Perder peso, ganar fuerza, sentirme mejor..." />
      </Field>
      <div className="grid grid-cols-2 gap-3 items-end">
        <Field label="¿Has entrenado antes?">
          <Select name="hasTrainedBefore" value={hasTrained ? "yes" : "no"} onChange={(e) => setHasTrained(e.target.value === "yes")}>
            <option value="no">No</option>
            <option value="yes">Sí</option>
          </Select>
        </Field>
        <Field label="¿Cómo nos has conocido?">
          <Select name="channel" required defaultValue="">
            <option value="" disabled>
              Selecciona...
            </option>
            {channels.map((c) => (
              <option key={c.id} value={c.label}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {hasTrained && (
        <Field label="Cuéntanos algo más (opcional)">
          <Input name="hasTrainedNote" placeholder="Qué tipo de entrenamiento, cuánto tiempo..." />
        </Field>
      )}
      <Field label="¿Alguna lesión, enfermedad o patología?" hint="Escribe “ninguna” si no aplica — es un campo obligatorio por tu seguridad">
        <Input name="healthNote" required placeholder="Ninguna / detállalo aquí" />
      </Field>
      <Button type="submit" className="w-full" size="lg">
        Enviar solicitud
      </Button>
    </ActionForm>
  );
}
