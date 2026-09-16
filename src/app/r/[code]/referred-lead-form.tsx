"use client";

import { useState } from "react";
import Link from "next/link";

import { trackConversion } from "@/components/analytics";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CONVERSIONS } from "@/lib/analytics";
import {
  buildLeadPrivacyNotice,
  LEAD_HEALTH_CONSENT_LABEL,
  LEAD_HEALTH_QUESTION,
  LEAD_MARKETING_CONSENT_LABEL,
} from "@/lib/consent";
import { ADULT_AGE, ageOn } from "@/lib/minors";
import { submitReferredLead } from "./actions";

/**
 * El formulario del enlace de referido. Es hermano del de `/lead-form` y no su
 * copia: le faltan dos cosas a propósito y le sobra una tercera.
 *
 *  · NO pregunta "¿cómo nos has conocido?". Por definición lo sabemos: entró
 *    por el enlace de un socio, y el canal es "Referido".
 *  · NO pregunta el centro. Sale del código; si viniera del cliente, cualquiera
 *    podría colar leads en el centro que quisiera.
 *  · SÍ dice quién invita, arriba del todo, porque es lo que hace que esto
 *    funcione: no es un formulario de una empresa, es la recomendación de un
 *    amigo.
 *
 * Las reglas de datos personales son las mismas del formulario público y salen
 * de los mismos módulos —`consent.ts` y `minors.ts`—, no de una segunda copia:
 * la capa informativa del art. 13, la casilla de salud nunca premarcada y el
 * corte de captura de salud a menores (E10-01, E10-12).
 */
export function ReferredLeadForm({
  code,
  orgName,
  referrerFirstName,
  incentive,
}: {
  code: string;
  orgName: string;
  referrerFirstName: string;
  incentive: string | null;
}) {
  const [sent, setSent] = useState(false);
  const [hasTrained, setHasTrained] = useState(false);
  const [hasCondition, setHasCondition] = useState(false);
  const [birthDate, setBirthDate] = useState("");
  const age = birthDate ? ageOn(new Date(`${birthDate}T00:00:00.000Z`), new Date()) : null;
  const isMinor = age != null && Number.isFinite(age) && age >= 0 && age < ADULT_AGE;
  const notice = buildLeadPrivacyNotice(orgName);

  if (sent) {
    return (
      <div className="text-center py-10">
        <div className="w-14 h-14 rounded-full bg-tz-black text-tz-bone flex items-center justify-center mx-auto text-2xl">
          ✓
        </div>
        <h2 className="font-display font-extrabold text-xl uppercase mt-4 text-brand-text">¡Gracias!</h2>
        <p className="text-sm text-brand-text-2 mt-2">
          Hemos recibido tus datos y sabemos que vienes de parte de {referrerFirstName}. Te llamamos para darte cita de
          valoración.
        </p>
      </div>
    );
  }

  return (
    <ActionForm
      className="space-y-4"
      successMessage="Solicitud enviada"
      action={(fd) =>
        submitReferredLead(code, fd).then((r) => {
          if (r.ok) {
            setSent(true);
            // E9-09 · el evento va aquí y no en el `submit`: este formulario no
            // navega, y contar el envío contaría también los que fallan.
            trackConversion(CONVERSIONS.lead);
          }
          return r;
        })
      }
    >
      {incentive && (
        <p className="rounded-xl border border-brand-border bg-white px-4 py-3.5 text-[12.5px] leading-snug text-brand-text-2">
          <b className="text-tz-black">Por venir de parte de {referrerFirstName}:</b> {incentive} Lo aplica el equipo
          del centro cuando te des de alta — no se descuenta solo, te lo confirman ellos.
        </p>
      )}

      {/* E10-01 · capa informativa del art. 13, primera capa. La segunda es
          /privacidad, enlazada al final. */}
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
        <Field label="Teléfono" hint="Para confirmarte la cita">
          <Input name="phone" required placeholder="600 000 000" />
        </Field>
        <Field label="Email (opcional)">
          <Input name="email" type="email" placeholder="tu@email.com" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de nacimiento">
          <Input
            name="birthDate"
            type="date"
            required
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </Field>
        <Field label="Código postal">
          <Input name="postalCode" required pattern="\d{5}" maxLength={5} placeholder="28001" />
        </Field>
      </div>
      <Field label="¿A qué te dedicas?">
        <Input name="occupation" required placeholder="Tu ocupación" />
      </Field>
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
        <textarea
          name="goals"
          required
          rows={3}
          className="w-full rounded-control border border-brand-border bg-white px-3.5 py-2.5 text-sm"
          placeholder="Perder peso, ganar fuerza, sentirme mejor..."
        />
      </Field>
      <Field label="¿Has entrenado antes?">
        <Select
          name="hasTrainedBefore"
          value={hasTrained ? "yes" : "no"}
          onChange={(e) => setHasTrained(e.target.value === "yes")}
        >
          <option value="no">No</option>
          <option value="yes">Sí</option>
        </Select>
      </Field>
      {hasTrained && (
        <Field label="Cuéntanos algo más (opcional)">
          <Input name="hasTrainedNote" placeholder="Qué tipo de entrenamiento, cuánto tiempo..." />
        </Field>
      )}
      {!isMinor && (
        <Field
          label={LEAD_HEALTH_QUESTION}
          hint="Con un sí/no basta. El detalle lo vemos en la valoración, con tu entrenador delante."
        >
          <Select
            name="hasHealthCondition"
            value={hasCondition ? "yes" : "no"}
            onChange={(e) => setHasCondition(e.target.value === "yes")}
          >
            <option value="no">No</option>
            <option value="yes">Sí</option>
          </Select>
        </Field>
      )}
      {isMinor && (
        <p className="text-[12.5px] leading-snug text-brand-text-2 rounded-xl border border-brand-border bg-tz-bone px-4 py-3.5">
          Como eres menor de {ADULT_AGE} años, por aquí no recogemos nada sobre tu salud: eso se ve en el centro, con
          tu madre, padre o tutor delante. Puedes enviar el resto de la solicitud sin problema.
        </p>
      )}
      {hasCondition && !isMinor && (
        <label className="flex gap-3 items-start rounded-xl border border-brand-border bg-white px-4 py-3.5 cursor-pointer">
          <input
            type="checkbox"
            name="healthConsent"
            value="yes"
            className="w-[18px] h-[18px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
          />
          <span className="text-[12.5px] leading-snug text-brand-text-2">
            <b className="text-tz-black">Dato de salud.</b> {LEAD_HEALTH_CONSENT_LABEL} Si no lo marcas, tu solicitud
            se envía igual y no guardamos nada sobre tu salud.
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
        Pedir mi valoración
      </Button>
    </ActionForm>
  );
}
