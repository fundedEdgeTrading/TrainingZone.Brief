"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ESSENTIAL_PROFILE_FIELDS, type EssentialProfileField } from "@/lib/member-first-session";
import { completeEssentialProfileAction, submitMemberInitialPartAction } from "./first-session-actions";

/**
 * F-ALTA: el muro de la primera sesión del socio.
 *
 * A diferencia del aviso de valoración vencida (`pending-assessment-gate.tsx`),
 * este **no tiene salida**, y la diferencia es deliberada: allí lo que se pide
 * es una revisión que solo puede cerrar el entrenador, y encerrar al socio
 * fuera de su propia reserva por eso sería peor que la revisión que falta. Aquí
 * todo lo que se pregunta lo puede contestar él mismo en un minuto, así que
 * dejar un «ahora no» equivale a no pedirlo nunca — y sin CP no hay mapa de
 * barrios ni métricas de zona.
 *
 * Se pinta en lugar del portal, no encima: un modal superpuesto deja debajo una
 * página navegable con el tabulador.
 */

const SEXO_OPTIONS = [
  { value: "MUJER", label: "Mujer" },
  { value: "HOMBRE", label: "Hombre" },
  { value: "OTRO", label: "Otro" },
];

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

/** Escalas 1-5: el número solo no dice nada, la etiqueta sí. */
const SCALE_1_5 = [
  { value: "1", label: "1 — muy baja" },
  { value: "2", label: "2 — baja" },
  { value: "3", label: "3 — normal" },
  { value: "4", label: "4 — alta" },
  { value: "5", label: "5 — muy alta" },
];

function Shell({
  eyebrow,
  title,
  intro,
  orgLogoUrl,
  orgName,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  orgLogoUrl: string;
  orgName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-tz-black relative overflow-hidden flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="tz-aurora-blob tz-aurora-a" />
        <div className="tz-aurora-blob tz-aurora-b" />
      </div>
      <div className="relative z-10 w-full max-w-[560px] tz-fade-up">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo dinámico por organización */}
          <img src={orgLogoUrl} alt={orgName} className="h-[34px] w-auto object-contain inline-block" />
        </div>

        <div className="bg-white border border-tz-linen rounded-card shadow-pop p-9">
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-muted">{eyebrow}</div>
          <h1 className="font-display font-extrabold text-2xl uppercase tracking-[-.01em] mt-1.5">{title}</h1>
          <p className="text-sm text-muted mt-2 mb-5">{intro}</p>
          {children}
        </div>

        <p className="text-center text-xs text-muted mt-4.5">
          Solo te lo preguntamos una vez ·{" "}
          <a href="/api/auth/signout" className="text-faint">
            Cerrar sesión
          </a>
        </p>
      </div>
    </div>
  );
}

function EssentialProfileStep({
  missing,
  orgLogoUrl,
  orgName,
}: {
  missing: EssentialProfileField[];
  orgLogoUrl: string;
  orgName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fields = ESSENTIAL_PROFILE_FIELDS.filter((f) => missing.includes(f.key));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await completeEssentialProfileAction(new FormData(e.currentTarget));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Shell
      eyebrow="Tus datos"
      title="Nos faltan un par de datos tuyos"
      intro="Tu centro nos pasó tu ficha desde su sistema anterior y llegó incompleta. Con esto la dejamos al día."
      orgLogoUrl={orgLogoUrl}
      orgName={orgName}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        {fields.map((f) => (
          <Field key={f.key} label={f.label} hint={f.why}>
            {f.key === "birthDate" ? (
              <Input name={f.key} type="date" required max={new Date().toISOString().slice(0, 10)} />
            ) : f.key === "phone" ? (
              <Input name={f.key} type="tel" required placeholder="+34 600 000 000" />
            ) : f.key === "postalCode" ? (
              <Input name={f.key} required inputMode="numeric" maxLength={5} placeholder="50007" />
            ) : f.key === "emergencyContact" ? (
              <Input name={f.key} required placeholder="Nombre y teléfono" />
            ) : (
              <Input name={f.key} required />
            )}
          </Field>
        ))}

        {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}

        <Button type="submit" size="lg" disabled={pending} className="mt-1.5">
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Continuar →"}
        </Button>
      </form>
    </Shell>
  );
}

function InitialAssessmentStep({ orgLogoUrl, orgName }: { orgLogoUrl: string; orgName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await submitMemberInitialPartAction({
      pesoKg: num(vitals.pesoKg),
      dolorActual: num(vitals.dolorActual),
      calidadSueno: num(vitals.calidadSueno),
      estres: num(vitals.estres),
      energia: num(vitals.energia),
      diasPorSemana: vitals.diasPorSemana,
      perfil: { ...perfil, edad: num(perfil.edad), alturaCm: num(perfil.alturaCm) },
      experiencia: { ...experiencia, anosExperiencia: num(experiencia.anosExperiencia) },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <Shell
      eyebrow="Valoración inicial"
      title="Tu valoración inicial"
      intro="Esta parte la contestas tú: de dónde partes y a dónde quieres llegar. Las pruebas físicas y el cuestionario de salud los haréis tu entrenador y tú en la primera sesión."
      orgLogoUrl={orgLogoUrl}
      orgName={orgName}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <section className="flex flex-col gap-3.5">
          <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">Sobre ti</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <Field label="Edad">
              <Input
                type="number"
                required
                min={14}
                max={100}
                value={perfil.edad}
                onChange={(e) => setPerfil((p) => ({ ...p, edad: e.target.value }))}
              />
            </Field>
            <Field label="Sexo">
              <Select value={perfil.sexo} onChange={(e) => setPerfil((p) => ({ ...p, sexo: e.target.value }))}>
                {SEXO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Altura (cm)">
              <Input
                type="number"
                required
                min={120}
                max={230}
                value={perfil.alturaCm}
                onChange={(e) => setPerfil((p) => ({ ...p, alturaCm: e.target.value }))}
              />
            </Field>
          </div>

          <Field label="Tu objetivo principal">
            <Input
              required
              maxLength={200}
              placeholder="Ej.: volver a correr 10 km sin dolor de rodilla"
              value={perfil.objetivoPrincipal}
              onChange={(e) => setPerfil((p) => ({ ...p, objetivoPrincipal: e.target.value }))}
            />
          </Field>
          <Field label="Objetivo secundario" hint="Opcional">
            <Input
              maxLength={200}
              value={perfil.objetivoSecundario}
              onChange={(e) => setPerfil((p) => ({ ...p, objetivoSecundario: e.target.value }))}
            />
          </Field>
          <Field label="¿Por qué ahora?" hint="Opcional — lo que hay detrás del objetivo ayuda a sostenerlo">
            <Textarea
              rows={2}
              value={perfil.motivacionReal}
              onChange={(e) => setPerfil((p) => ({ ...p, motivacionReal: e.target.value }))}
            />
          </Field>
          <Field label="¿Qué te haría abandonar?" hint="Opcional — saberlo por adelantado es lo que permite evitarlo">
            <Textarea
              rows={2}
              value={perfil.queLeHariaAbandonar}
              onChange={(e) => setPerfil((p) => ({ ...p, queLeHariaAbandonar: e.target.value }))}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
          <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">De dónde partes</h2>
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

          <label className="flex gap-3 items-center rounded-xl border border-brand-border px-4 py-3 cursor-pointer hover:border-brand-border-hover transition-colors duration-200">
            <input
              type="checkbox"
              checked={experiencia.haEntrenadoAntes}
              onChange={() => setExperiencia((x) => ({ ...x, haEntrenadoAntes: !x.haEntrenadoAntes }))}
              className="w-[18px] h-[18px] accent-tz-black cursor-pointer shrink-0"
            />
            <span className="text-sm font-bold text-tz-black">He entrenado antes en un gimnasio</span>
          </label>

          {experiencia.haEntrenadoAntes && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <Field label="Años de experiencia">
                <Input
                  type="number"
                  min={0}
                  max={70}
                  step="0.5"
                  value={experiencia.anosExperiencia}
                  onChange={(e) => setExperiencia((x) => ({ ...x, anosExperiencia: e.target.value }))}
                />
              </Field>
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
            </div>
          )}

          <Field label="Ejercicios que no toleras" hint="Opcional — si algo te da dolor, dilo aquí y no lo programamos">
            <Textarea
              rows={2}
              value={experiencia.ejerciciosNoTolera}
              onChange={(e) => setExperiencia((x) => ({ ...x, ejerciciosNoTolera: e.target.value }))}
            />
          </Field>

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
        </section>

        <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
          <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">Cómo llegas hoy</h2>
          <p className="text-[12.5px] text-muted -mt-2">
            Es tu punto de partida: dentro de un mes volveremos a preguntarte lo mismo para ver qué ha cambiado.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Field label="Peso (kg)">
              <Input
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
            <Field label="Nivel de estrés">
              <Select value={vitals.estres} onChange={(e) => setVitals((v) => ({ ...v, estres: e.target.value }))}>
                {SCALE_1_5.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Energía">
              <Select value={vitals.energia} onChange={(e) => setVitals((v) => ({ ...v, energia: e.target.value }))}>
                {SCALE_1_5.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </section>

        {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}

        <Button type="submit" size="lg" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar y entrar →"}
        </Button>
      </form>
    </Shell>
  );
}

export function FirstSessionWall({
  step,
  missing,
  orgLogoUrl,
  orgName,
}: {
  step: "profile" | "assessment";
  missing: EssentialProfileField[];
  orgLogoUrl: string;
  orgName: string;
}) {
  // Sin numerar los pasos a propósito. El muro no guarda por dónde iba: en
  // cuanto el socio salva sus datos, `missing` queda vacío y un «paso 1 de 2»
  // pintado desde ese estado diría que quedan dos pasos cuando ya solo queda
  // uno. Cada pantalla se presenta por lo que es y ninguna miente.
  if (step === "profile") {
    return <EssentialProfileStep missing={missing} orgLogoUrl={orgLogoUrl} orgName={orgName} />;
  }
  return <InitialAssessmentStep orgLogoUrl={orgLogoUrl} orgName={orgName} />;
}
