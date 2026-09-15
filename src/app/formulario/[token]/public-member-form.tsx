"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DEFAULT_ASSESSMENT_CONFIG, isQuestionEnabled } from "@/lib/assessments/config";
import {
  buildMemberFormPrivacyNotice,
  CONSENT_TEXT,
  GUARDIAN_DECLARATION_LABEL,
  MEMBER_FORM_CONSENT_COPY,
  type ConsentKind,
} from "@/lib/consent";
import { ADULT_AGE, ageOn } from "@/lib/minors";
import type { MemberFormContext } from "@/lib/member-forms";
import { submitMemberFormAction } from "./actions";

/**
 * Las mismas preguntas del formulario del portal
 * (`portal/valoracion/[id]/initial-assessment-form.tsx`), servidas sin sesión.
 *
 * Tres cosas que este formulario hace y aquel no, y las tres son de E10:
 *  · la capa informativa del art. 13 va ARRIBA, antes del primer campo, y la
 *    casilla de salud va sola, en su propio bloque y nunca premarcada (E10-01);
 *  · pregunta la fecha de nacimiento cuando no consta y, si quien rellena es
 *    menor, pide el tutor o para (E10-12) — la decisión de edad la toma
 *    `minors.ts`, aquí solo se decide QUÉ se pinta;
 *  · la casilla comercial va aparte, es opcional y su fecha y versión se
 *    guardan: es lo que habilita los flujos de E2/E3.
 *
 * A un LEAD no se le preguntan constantes ni preguntas propias del centro: su
 * ficha no tiene dónde guardarlas con el trato del art. 9 que les corresponde
 * (ver `submitForLead` en member-forms.ts). Se le pregunta lo que su ficha sí
 * puede recibir.
 */

const SEXO_OPTIONS = [
  { value: "MUJER", label: "Mujer" },
  { value: "HOMBRE", label: "Hombre" },
  { value: "OTRO", label: "Otro" },
];

const SEX_TO_MEMBER = { MUJER: "FEMALE", HOMBRE: "MALE", OTRO: "OTHER" } as const;

const NIVEL_OPTIONS = [
  { value: "BAJO", label: "Bajo — apenas me muevo" },
  { value: "MEDIO", label: "Medio — algo de actividad" },
  { value: "ALTO", label: "Alto — entreno con regularidad" },
];

const TECNICA_OPTIONS = [
  { value: "BAJA", label: "Baja — nunca los he hecho" },
  { value: "MEDIA", label: "Media — los he hecho, con dudas" },
  { value: "ALTA", label: "Alta — los domino" },
];

const DIAS_OPTIONS = [
  { value: "1", label: "1 día" },
  { value: "2", label: "2 días" },
  { value: "3", label: "3 días" },
  { value: "MAS_DE_3", label: "Más de 3 días" },
];

const SCALE_1_5 = [
  { value: "1", label: "1 — muy baja" },
  { value: "2", label: "2 — baja" },
  { value: "3", label: "3 — normal" },
  { value: "4", label: "4 — alta" },
  { value: "5", label: "5 — muy alta" },
];

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

export function PublicMemberForm({ context }: { context: MemberFormContext }) {
  const isLead = context.targetKind === "lead";
  const isInitial = context.kind === "INITIAL";
  const notice = buildMemberFormPrivacyNotice(context.orgName);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [birthDate, setBirthDate] = useState(context.birthDate ?? "");
  const age = birthDate ? ageOn(new Date(`${birthDate}T00:00:00.000Z`), new Date()) : null;
  const isMinor = age != null && Number.isFinite(age) && age >= 0 && age < ADULT_AGE;
  // Menor y el centro no admite menores (o es un lead, que no tiene dónde
  // guardar de forma verificable el consentimiento del tutor): el formulario no
  // sigue, y dice por qué en vez de fallar al enviar.
  const minorBlocked = isMinor && (!context.agePolicy.allowsMinors || isLead);
  const guardianNeeded = isMinor && !minorBlocked;

  const [perfil, setPerfil] = useState({
    edad: "",
    sexo: "MUJER",
    alturaCm: "",
    objetivoPrincipal: "",
    objetivoSecundario: "",
    motivacionReal: "",
    queLeHariaAbandonar: "",
  });
  const [experiencia, setExperiencia] = useState({
    nivelActividad: "MEDIO",
    haEntrenadoAntes: false,
    anosExperiencia: "0",
    tecnicaBasicos: "MEDIA",
    ejerciciosNoTolera: "",
  });
  const [vitals, setVitals] = useState({
    pesoKg: "",
    dolorActual: "0",
    calidadSueno: "3",
    estres: "3",
    energia: "3",
    diasPorSemana: "2",
  });
  const [seguimiento, setSeguimiento] = useState({
    adherenciaPercibida: "3",
    progresoPercibido: "3",
    queHaMejorado: "",
    obstaculos: "",
    objetivoProximoPeriodo: "",
  });
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [consents, setConsents] = useState<Partial<Record<ConsentKind, boolean>>>({});
  const [guardian, setGuardian] = useState({ name: "", email: "", phone: "", idDocument: "", declared: false });

  const on = (key: string) =>
    isQuestionEnabled({ ...DEFAULT_ASSESSMENT_CONFIG, disabledQuestions: context.disabledQuestions }, key);
  const only = <T extends object>(key: string, value: T) => (on(key) ? value : {});

  const healthOk = consents.health === true;
  const guardianOk = !guardianNeeded || (guardian.declared && guardian.name.trim() && guardian.idDocument.trim());
  const canSubmit = healthOk && guardianOk && !minorBlocked;

  function buildAnswers() {
    const perfilAnswers = {
      edad: num(perfil.edad),
      sexo: perfil.sexo,
      alturaCm: num(perfil.alturaCm),
      objetivoPrincipal: perfil.objetivoPrincipal,
      ...only("perfil.objetivoSecundario", { objetivoSecundario: perfil.objetivoSecundario }),
      ...only("perfil.motivacionReal", { motivacionReal: perfil.motivacionReal }),
      ...only("perfil.queLeHariaAbandonar", { queLeHariaAbandonar: perfil.queLeHariaAbandonar }),
    };
    const experienciaAnswers = {
      ...only("experiencia.nivelActividad", { nivelActividad: experiencia.nivelActividad }),
      ...only("experiencia.haEntrenadoAntes", { haEntrenadoAntes: experiencia.haEntrenadoAntes }),
      ...only("experiencia.anosExperiencia", { anosExperiencia: num(experiencia.anosExperiencia) }),
      ...only("experiencia.tecnicaBasicos", { tecnicaBasicos: experiencia.tecnicaBasicos }),
      ...only("experiencia.ejerciciosNoTolera", { ejerciciosNoTolera: experiencia.ejerciciosNoTolera }),
    };

    // Al lead solo se le manda lo que su ficha puede recibir: el servidor
    // ignora el resto, pero mandarlo sería mandar datos de salud a un sitio que
    // no los va a guardar.
    if (isLead) return { perfil: perfilAnswers, experiencia: experienciaAnswers };

    const vitalsAnswers = {
      pesoKg: num(vitals.pesoKg),
      dolorActual: num(vitals.dolorActual),
      ...only("calidadSueno", { calidadSueno: num(vitals.calidadSueno) }),
      ...only("estres", { estres: num(vitals.estres) }),
      ...only("energia", { energia: num(vitals.energia) }),
      ...only("diasPorSemana", { diasPorSemana: vitals.diasPorSemana }),
    };

    const customAnswers = Object.fromEntries(
      context.customQuestions
        .map((q) => {
          const raw = custom[q.key];
          if (raw === undefined || raw === "") return null;
          return [q.key, q.type === "TEXT" ? raw : Number(raw)] as const;
        })
        .filter((entry): entry is readonly [string, string | number] => entry !== null),
    );

    if (isInitial) {
      return { ...vitalsAnswers, perfil: perfilAnswers, experiencia: experienciaAnswers, custom: customAnswers };
    }
    return {
      ...vitalsAnswers,
      seguimiento: {
        ...only("seguimiento.adherenciaPercibida", { adherenciaPercibida: num(seguimiento.adherenciaPercibida) }),
        ...only("seguimiento.progresoPercibido", { progresoPercibido: num(seguimiento.progresoPercibido) }),
        ...only("seguimiento.queHaMejorado", { queHaMejorado: seguimiento.queHaMejorado }),
        ...only("seguimiento.obstaculos", { obstaculos: seguimiento.obstaculos }),
        ...only("seguimiento.objetivoProximoPeriodo", { objetivoProximoPeriodo: seguimiento.objetivoProximoPeriodo }),
      },
      custom: customAnswers,
    };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await submitMemberFormAction({
      token: context.token,
      answers: buildAnswers(),
      birthDate: birthDate || null,
      sex: isInitial ? SEX_TO_MEMBER[perfil.sexo as keyof typeof SEX_TO_MEMBER] : null,
      consents: {
        health: consents.health === true,
        images: consents.images === true,
        ai: consents.ai === true,
        marketing: consents.marketing === true,
      },
      guardian: guardianNeeded
        ? {
            name: guardian.name,
            email: guardian.email,
            phone: guardian.phone,
            idDocument: guardian.idDocument,
            declared: guardian.declared,
          }
        : null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center py-8">
        <div className="w-14 h-14 rounded-full bg-tz-black text-tz-bone flex items-center justify-center mx-auto text-2xl">
          ✓
        </div>
        <h2 className="font-display font-extrabold text-xl uppercase mt-4 text-brand-text">¡Gracias!</h2>
        <p className="text-sm text-brand-text-2 mt-2">
          Ya lo tenemos en tu ficha. Tu entrenador lo repasará contigo en la próxima sesión — las pruebas físicas y
          el cuestionario de salud se hacen allí, con él delante.
        </p>
        <p className="text-xs text-brand-faint mt-4">Ya puedes cerrar esta página.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      {/* E10-01 · capa informativa del art. 13, ANTES del primer campo. */}
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
          <b className="text-tz-black">Destinatarios:</b> {notice.destinatarios}
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

      {/* E10-12 · sin fecha de nacimiento no se sabe si quien rellena es menor. */}
      <section className="flex flex-col gap-3.5">
        <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">Sobre ti</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <Field label="Fecha de nacimiento">
            <Input
              aria-label="Fecha de nacimiento"
              name="birthDate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </Field>
          {isInitial && (
            <Field label="Sexo">
              <Select value={perfil.sexo} onChange={(e) => setPerfil((p) => ({ ...p, sexo: e.target.value }))}>
                {SEXO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {minorBlocked && (
          <p className="text-[12.5px] leading-snug text-brand-text-2 rounded-xl border border-critical/30 bg-critical-bg px-4 py-3.5">
            {isLead
              ? `Como eres menor de ${ADULT_AGE} años, esta parte se completa en el centro con tu madre, padre o tutor delante. Llámanos y lo vemos allí.`
              : `Este centro solo admite socios mayores de ${ADULT_AGE} años. Si crees que es un error, habla con el centro antes de rellenar nada.`}
          </p>
        )}
      </section>

      {!minorBlocked && (
        <>
          {guardianNeeded && (
            <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
              <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
                Consentimiento del tutor legal
              </h2>
              <p className="text-[12.5px] text-muted -mt-2">
                Quien va a entrenar es menor de {ADULT_AGE} años, así que esta parte la rellena su madre, padre o
                tutor legal (art. 7 LOPDGDD). Sin ella el formulario no se puede enviar.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Nombre y apellidos del tutor">
                  <Input
                    aria-label="Nombre y apellidos del tutor"
                    required
                    value={guardian.name}
                    onChange={(e) => setGuardian((g) => ({ ...g, name: e.target.value }))}
                  />
                </Field>
                <Field label="DNI / NIE del tutor">
                  <Input
                    aria-label="Documento de identidad del tutor"
                    required
                    value={guardian.idDocument}
                    onChange={(e) => setGuardian((g) => ({ ...g, idDocument: e.target.value }))}
                  />
                </Field>
                <Field label="Email del tutor">
                  <Input
                    aria-label="Email del tutor"
                    type="email"
                    value={guardian.email}
                    onChange={(e) => setGuardian((g) => ({ ...g, email: e.target.value }))}
                  />
                </Field>
                <Field label="Teléfono del tutor">
                  <Input
                    aria-label="Teléfono del tutor"
                    value={guardian.phone}
                    onChange={(e) => setGuardian((g) => ({ ...g, phone: e.target.value }))}
                  />
                </Field>
              </div>
              <label className="flex gap-3 items-start rounded-xl border border-brand-border px-4 py-3.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={guardian.declared}
                  onChange={() => setGuardian((g) => ({ ...g, declared: !g.declared }))}
                  className="w-[18px] h-[18px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
                />
                <span className="text-[12.5px] leading-snug text-brand-text-2">{GUARDIAN_DECLARATION_LABEL}</span>
              </label>
            </section>
          )}

          {isInitial && (
            <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
              <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
                Qué quieres conseguir
              </h2>
              {!isLead && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <Field label="Edad">
                    <Input
                      aria-label="Edad"
                      type="number"
                      required
                      min={14}
                      max={100}
                      value={perfil.edad}
                      onChange={(e) => setPerfil((p) => ({ ...p, edad: e.target.value }))}
                    />
                  </Field>
                  <Field label="Altura (cm)">
                    <Input
                      aria-label="Altura en centímetros"
                      type="number"
                      required
                      min={120}
                      max={230}
                      value={perfil.alturaCm}
                      onChange={(e) => setPerfil((p) => ({ ...p, alturaCm: e.target.value }))}
                    />
                  </Field>
                </div>
              )}
              <Field label="Tu objetivo principal">
                <Input
                  aria-label="Tu objetivo principal"
                  required
                  maxLength={200}
                  placeholder="Ej.: volver a correr 10 km sin dolor de rodilla"
                  value={perfil.objetivoPrincipal}
                  onChange={(e) => setPerfil((p) => ({ ...p, objetivoPrincipal: e.target.value }))}
                />
              </Field>
              {on("perfil.objetivoSecundario") && (
                <Field label="Objetivo secundario" hint="Opcional">
                  <Input
                    aria-label="Objetivo secundario"
                    maxLength={200}
                    value={perfil.objetivoSecundario}
                    onChange={(e) => setPerfil((p) => ({ ...p, objetivoSecundario: e.target.value }))}
                  />
                </Field>
              )}
              {on("perfil.motivacionReal") && (
                <Field label="¿Por qué ahora?" hint="Opcional — lo que hay detrás del objetivo ayuda a sostenerlo">
                  <Textarea
                    rows={2}
                    value={perfil.motivacionReal}
                    onChange={(e) => setPerfil((p) => ({ ...p, motivacionReal: e.target.value }))}
                  />
                </Field>
              )}
              {on("perfil.queLeHariaAbandonar") && (
                <Field
                  label="¿Qué te haría abandonar?"
                  hint="Opcional — saberlo por adelantado es lo que permite evitarlo"
                >
                  <Textarea
                    rows={2}
                    value={perfil.queLeHariaAbandonar}
                    onChange={(e) => setPerfil((p) => ({ ...p, queLeHariaAbandonar: e.target.value }))}
                  />
                </Field>
              )}
            </section>
          )}

          {isInitial && (
            <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
              <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
                De dónde partes
              </h2>
              {on("experiencia.nivelActividad") && !isLead && (
                <Field label="Nivel de actividad actual">
                  <Select
                    value={experiencia.nivelActividad}
                    onChange={(e) => setExperiencia((x) => ({ ...x, nivelActividad: e.target.value }))}
                  >
                    {NIVEL_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {on("experiencia.haEntrenadoAntes") && (
                <label className="flex gap-3 items-center rounded-xl border border-brand-border px-4 py-3 cursor-pointer hover:border-brand-border-hover transition-colors duration-200">
                  <input
                    type="checkbox"
                    checked={experiencia.haEntrenadoAntes}
                    onChange={() => setExperiencia((x) => ({ ...x, haEntrenadoAntes: !x.haEntrenadoAntes }))}
                    className="w-[18px] h-[18px] accent-tz-black cursor-pointer shrink-0"
                  />
                  <span className="text-sm font-bold text-tz-black">He entrenado antes en un gimnasio</span>
                </label>
              )}
              {experiencia.haEntrenadoAntes && !isLead && (on("experiencia.anosExperiencia") || on("experiencia.tecnicaBasicos")) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {on("experiencia.anosExperiencia") && (
                    <Field label="Años de experiencia">
                      <Input
                        aria-label="Años de experiencia"
                        type="number"
                        min={0}
                        max={70}
                        step="0.5"
                        value={experiencia.anosExperiencia}
                        onChange={(e) => setExperiencia((x) => ({ ...x, anosExperiencia: e.target.value }))}
                      />
                    </Field>
                  )}
                  {on("experiencia.tecnicaBasicos") && (
                    <Field label="Técnica en los básicos" hint="Sentadilla, peso muerto, empuje">
                      <Select
                        value={experiencia.tecnicaBasicos}
                        onChange={(e) => setExperiencia((x) => ({ ...x, tecnicaBasicos: e.target.value }))}
                      >
                        {TECNICA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                </div>
              )}
              {on("experiencia.ejerciciosNoTolera") && (
                <Field
                  label="Ejercicios que no toleras"
                  hint="Opcional — si algo te da dolor, dilo aquí y no lo programamos"
                >
                  <Textarea
                    rows={2}
                    value={experiencia.ejerciciosNoTolera}
                    onChange={(e) => setExperiencia((x) => ({ ...x, ejerciciosNoTolera: e.target.value }))}
                  />
                </Field>
              )}
              {on("diasPorSemana") && !isLead && (
                <Field label="¿Cuántos días por semana puedes entrenar?">
                  <Select
                    value={vitals.diasPorSemana}
                    onChange={(e) => setVitals((v) => ({ ...v, diasPorSemana: e.target.value }))}
                  >
                    {DIAS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </section>
          )}

          {!isLead && !isInitial && (
            <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
              <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
                Cómo ha ido el periodo
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {on("seguimiento.adherenciaPercibida") && (
                  <Field label="¿Has podido seguir el plan?" hint="1 = nada · 5 = del todo">
                    <Select
                      value={seguimiento.adherenciaPercibida}
                      onChange={(e) => setSeguimiento((s) => ({ ...s, adherenciaPercibida: e.target.value }))}
                    >
                      {SCALE_1_5.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {on("seguimiento.progresoPercibido") && (
                  <Field label="¿Notas progreso?" hint="1 = ninguno · 5 = mucho">
                    <Select
                      value={seguimiento.progresoPercibido}
                      onChange={(e) => setSeguimiento((s) => ({ ...s, progresoPercibido: e.target.value }))}
                    >
                      {SCALE_1_5.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
              {on("seguimiento.queHaMejorado") && (
                <Field label="¿Qué ha mejorado?">
                  <Textarea
                    rows={2}
                    value={seguimiento.queHaMejorado}
                    onChange={(e) => setSeguimiento((s) => ({ ...s, queHaMejorado: e.target.value }))}
                  />
                </Field>
              )}
              {on("seguimiento.obstaculos") && (
                <Field label="¿Qué se te ha puesto por delante?">
                  <Textarea
                    rows={2}
                    value={seguimiento.obstaculos}
                    onChange={(e) => setSeguimiento((s) => ({ ...s, obstaculos: e.target.value }))}
                  />
                </Field>
              )}
              {on("seguimiento.objetivoProximoPeriodo") && (
                <Field label="Tu objetivo para el próximo periodo">
                  <Input
                    aria-label="Objetivo del próximo periodo"
                    value={seguimiento.objetivoProximoPeriodo}
                    onChange={(e) => setSeguimiento((s) => ({ ...s, objetivoProximoPeriodo: e.target.value }))}
                  />
                </Field>
              )}
            </section>
          )}

          {!isLead && (
            <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
              <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
                Cómo llegas hoy
              </h2>
              <p className="text-[12.5px] text-muted -mt-2">
                Es tu punto de partida: dentro de un mes volveremos a preguntarte lo mismo para ver qué ha cambiado.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="Peso (kg)">
                  <Input
                    aria-label="Peso en kilos"
                    type="number"
                    required
                    min={20}
                    max={400}
                    step="0.1"
                    value={vitals.pesoKg}
                    onChange={(e) => setVitals((v) => ({ ...v, pesoKg: e.target.value }))}
                  />
                </Field>
                <Field label="Dolor ahora mismo (0-10)" hint="0 = ninguno">
                  <Input
                    aria-label="Dolor ahora mismo, de 0 a 10"
                    type="number"
                    required
                    min={0}
                    max={10}
                    value={vitals.dolorActual}
                    onChange={(e) => setVitals((v) => ({ ...v, dolorActual: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {on("calidadSueno") && (
                  <Field label="Calidad del sueño">
                    <Select
                      value={vitals.calidadSueno}
                      onChange={(e) => setVitals((v) => ({ ...v, calidadSueno: e.target.value }))}
                    >
                      {SCALE_1_5.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {on("estres") && (
                  <Field label="Nivel de estrés">
                    <Select value={vitals.estres} onChange={(e) => setVitals((v) => ({ ...v, estres: e.target.value }))}>
                      {SCALE_1_5.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {on("energia") && (
                  <Field label="Energía">
                    <Select value={vitals.energia} onChange={(e) => setVitals((v) => ({ ...v, energia: e.target.value }))}>
                      {SCALE_1_5.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
            </section>
          )}

          {/* F-VAL · las preguntas que el centro ha añadido por su cuenta. Se
              responden aquí igual que en el formulario del entrenador y caen en
              `answers.custom[clave]`. */}
          {!isLead && context.customQuestions.length > 0 && (
            <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
              <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
                Preguntas del centro
              </h2>
              {context.customQuestions.map((q) => (
                <Field key={q.key} label={q.label} hint={q.required ? undefined : "Opcional"}>
                  {q.type === "TEXT" ? (
                    <Textarea
                      rows={2}
                      value={custom[q.key] ?? ""}
                      onChange={(e) => setCustom((c) => ({ ...c, [q.key]: e.target.value }))}
                    />
                  ) : (
                    <Input
                      aria-label={q.label}
                      type="number"
                      required={q.required}
                      {...(q.type === "SCALE_1_5" ? { min: 1, max: 5 } : {})}
                      value={custom[q.key] ?? ""}
                      onChange={(e) => setCustom((c) => ({ ...c, [q.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </section>
          )}

          {/* E10-01/E10-03 · el consentimiento de salud va SOLO, explícito y sin
              premarcar. Los otros tres, aparte y opcionales. */}
          <section className="flex flex-col gap-2.5 border-t border-brand-border pt-5">
            <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">
              Tus datos, tus reglas
            </h2>
            {context.consents.map((ask) => {
              const copy = MEMBER_FORM_CONSENT_COPY[ask.kind];
              const checked = consents[ask.kind] === true;
              return (
                <label
                  key={ask.kind}
                  className={clsx(
                    "flex gap-3.5 items-start rounded-xl px-4 py-3.5 cursor-pointer transition-colors duration-200 border",
                    checked
                      ? "border-brand-ink bg-tz-bone"
                      : "border-brand-border bg-white hover:border-brand-border-hover",
                    ask.required && "mb-1.5",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setConsents((s) => ({ ...s, [ask.kind]: !s[ask.kind] }))}
                    className="w-[18px] h-[18px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
                  />
                  <span>
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-tz-black">{copy.title}</span>
                      <span
                        className={clsx(
                          "rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em]",
                          ask.required ? "bg-critical-bg text-critical" : "bg-tz-sand text-text-2",
                        )}
                      >
                        {ask.required ? "Obligatorio ✱" : "Opcional"}
                      </span>
                    </span>
                    <span className="block text-[12.5px] text-brand-text-2 leading-snug mt-0.5">{copy.label}</span>
                    <span className="block text-[11.5px] text-faint leading-snug mt-1">{copy.help}</span>
                  </span>
                </label>
              );
            })}
            <div className="text-[11.5px] text-faint leading-relaxed mt-1.5 flex flex-col gap-2">
              {CONSENT_TEXT.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </section>

          {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}

          <Button type="submit" size="lg" disabled={pending || !canSubmit}>
            {pending && <ButtonSpinner />}
            {pending ? "Guardando..." : "Enviar mi formulario →"}
          </Button>
          {!healthOk && (
            <p className="text-xs text-brand-muted text-center -mt-2">
              El consentimiento de datos de salud (✱) es necesario para enviarlo.
            </p>
          )}
        </>
      )}
    </form>
  );
}
