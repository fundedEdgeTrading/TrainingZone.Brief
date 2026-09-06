"use client";

import { useState } from "react";
import Link from "next/link";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/ui/action-form";
import {
  buildLeadPrivacyNotice,
  LEAD_HEALTH_CONSENT_LABEL,
  LEAD_HEALTH_QUESTION,
  LEAD_MARKETING_CONSENT_LABEL,
} from "@/lib/consent";
import { submitPublicLead } from "./actions";

export function PublicLeadForm({
  orgSlug,
  centerSlug,
  orgName,
  channels,
}: {
  orgSlug: string;
  centerSlug: string;
  orgName: string;
  channels: { id: string; label: string }[];
}) {
  const [sent, setSent] = useState(false);
  const [hasTrained, setHasTrained] = useState(false);
  // E10-01: el sí/no de salud sustituye al texto libre, y la casilla de salud
  // solo aparece cuando hay algo que consentir. Ninguna de las dos casillas
  // nace marcada.
  const [hasCondition, setHasCondition] = useState(false);
  const notice = buildLeadPrivacyNotice(orgName);

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
      {/* E10-01 · capa informativa del art. 13, primera capa. La segunda capa
          es /privacidad, enlazada al final. */}
      <div className="rounded-xl border border-brand-border bg-tz-bone px-4 py-3.5 text-[12.5px] leading-snug text-brand-text-2 space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-brand-muted">Qué hacemos con tus datos</p>
        <p>
          <b className="text-tz-black">Responsable:</b> {notice.responsable}
        </p>
        <p>
          <b className="text-tz-black">Finalidad:</b> {notice.finalidad}
        </p>
        <p>
          <b className="text-tz-black">Base jurídica:</b> {notice.baseJuridica}
        </p>
        <p>
          <b className="text-tz-black">Conservación:</b> {notice.conservacion}
        </p>
        <p>
          <b className="text-tz-black">Tus derechos:</b> {notice.derechos}
        </p>
        <p>
          <Link href={notice.politicaUrl} className="underline font-semibold text-tz-black">
            Política de privacidad completa
          </Link>
        </p>
      </div>
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
      <Field label={LEAD_HEALTH_QUESTION} hint="Con un sí/no basta. El detalle lo vemos en la valoración, con tu entrenador delante.">
        <Select
          name="hasHealthCondition"
          value={hasCondition ? "yes" : "no"}
          onChange={(e) => setHasCondition(e.target.value === "yes")}
        >
          <option value="no">No</option>
          <option value="yes">Sí</option>
        </Select>
      </Field>
      {hasCondition && (
        <label className="flex gap-3 items-start rounded-xl border border-brand-border bg-white px-4 py-3.5 cursor-pointer">
          <input
            type="checkbox"
            name="healthConsent"
            value="yes"
            className="w-[18px] h-[18px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
          />
          <span className="text-[12.5px] leading-snug text-brand-text-2">
            <b className="text-tz-black">Dato de salud.</b> {LEAD_HEALTH_CONSENT_LABEL} Si no lo marcas, tu
            solicitud se envía igual y no guardamos nada sobre tu salud.
          </span>
        </label>
      )}
      <label className="flex gap-3 items-start rounded-xl border border-brand-border bg-white px-4 py-3.5 cursor-pointer">
        <input
          type="checkbox"
          name="marketingConsent"
          value="yes"
          className="w-[18px] h-[18px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
        />
        <span className="text-[12.5px] leading-snug text-brand-text-2">
          <b className="text-tz-black">Comunicaciones comerciales.</b> {LEAD_MARKETING_CONSENT_LABEL}
        </span>
      </label>
      <Button type="submit" className="w-full" size="lg">
        Enviar solicitud
      </Button>
    </ActionForm>
  );
}
