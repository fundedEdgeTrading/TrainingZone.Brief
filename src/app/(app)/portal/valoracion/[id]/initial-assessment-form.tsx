"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DEFAULT_ASSESSMENT_CONFIG, isQuestionEnabled } from "@/lib/assessments/config";
import { submitMemberInitialPartAction } from "../../first-session-actions";

/**
 * E5-08: la parte de la valoración inicial que contesta el propio socio —
 * antes vivía dentro del muro de alta, bloqueando la reserva. Ahora se pide
 * aquí, en `/portal/valoracion/<id>`, a la que se llega desde el aviso
 * pospuesto (`PendingAssessmentGate`), que sí tiene salida ("Ahora no").
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

export function InitialAssessmentForm({
  /** Preguntas que el centro ha quitado del cuestionario (F-VAL). */
  disabledQuestions = [],
}: {
  disabledQuestions?: string[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

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
  const on = (key: string) => isQuestionEnabled({ ...DEFAULT_ASSESSMENT_CONFIG, disabledQuestions }, key);
  const only = <T extends object>(key: string, value: T) => (on(key) ? value : {});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await submitMemberInitialPartAction({
      pesoKg: num(vitals.pesoKg),
      dolorActual: num(vitals.dolorActual),
      ...only("calidadSueno", { calidadSueno: num(vitals.calidadSueno) }),
      ...only("estres", { estres: num(vitals.estres) }),
      ...only("energia", { energia: num(vitals.energia) }),
      ...only("diasPorSemana", { diasPorSemana: vitals.diasPorSemana }),
      perfil: {
        edad: num(perfil.edad),
        sexo: perfil.sexo,
        alturaCm: num(perfil.alturaCm),
        objetivoPrincipal: perfil.objetivoPrincipal,
        ...only("perfil.objetivoSecundario", { objetivoSecundario: perfil.objetivoSecundario }),
        ...only("perfil.motivacionReal", { motivacionReal: perfil.motivacionReal }),
        ...only("perfil.queLeHariaAbandonar", { queLeHariaAbandonar: perfil.queLeHariaAbandonar }),
      },
      experiencia: {
        ...only("experiencia.nivelActividad", { nivelActividad: experiencia.nivelActividad }),
        ...only("experiencia.haEntrenadoAntes", { haEntrenadoAntes: experiencia.haEntrenadoAntes }),
        ...only("experiencia.anosExperiencia", { anosExperiencia: num(experiencia.anosExperiencia) }),
        ...only("experiencia.tecnicaBasicos", { tecnicaBasicos: experiencia.tecnicaBasicos }),
        ...only("experiencia.ejerciciosNoTolera", { ejerciciosNoTolera: experiencia.ejerciciosNoTolera }),
      },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <div className="bg-white border border-brand-border rounded-[18px] p-7 text-center">
        <div className="font-display font-extrabold text-xl text-brand-text">¡Gracias!</div>
        <p className="text-sm text-brand-muted mt-2">
          Ya tenemos tu parte. Las pruebas físicas y el cuestionario de salud los haréis tu entrenador y tú en la
          primera sesión.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="bg-white border border-brand-border rounded-[18px] p-7 flex flex-col gap-5">
      <section className="flex flex-col gap-3.5">
        <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">Sobre ti</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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
          <Field label="¿Qué te haría abandonar?" hint="Opcional — saberlo por adelantado es lo que permite evitarlo">
            <Textarea
              rows={2}
              value={perfil.queLeHariaAbandonar}
              onChange={(e) => setPerfil((p) => ({ ...p, queLeHariaAbandonar: e.target.value }))}
            />
          </Field>
        )}
      </section>

      <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
        <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">De dónde partes</h2>
        {on("experiencia.nivelActividad") && (
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

        {experiencia.haEntrenadoAntes && (on("experiencia.anosExperiencia") || on("experiencia.tecnicaBasicos")) && (
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
          <Field label="Ejercicios que no toleras" hint="Opcional — si algo te da dolor, dilo aquí y no lo programamos">
            <Textarea
              rows={2}
              value={experiencia.ejerciciosNoTolera}
              onChange={(e) => setExperiencia((x) => ({ ...x, ejerciciosNoTolera: e.target.value }))}
            />
          </Field>
        )}

        {on("diasPorSemana") && (
          <Field label="¿Cuántos días por semana puedes entrenar?">
            <Select value={vitals.diasPorSemana} onChange={(e) => setVitals((v) => ({ ...v, diasPorSemana: e.target.value }))}>
              {DIAS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </section>

      <section className="flex flex-col gap-3.5 border-t border-brand-border pt-5">
        <h2 className="font-display font-bold text-[11px] tracking-[.14em] uppercase text-muted">Cómo llegas hoy</h2>
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
              <Select value={vitals.calidadSueno} onChange={(e) => setVitals((v) => ({ ...v, calidadSueno: e.target.value }))}>
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

      {error && <p className="text-sm text-critical bg-critical-bg rounded-control px-3 py-2">{error}</p>}

      <Button type="submit" size="lg" disabled={pending}>
        {pending && <ButtonSpinner />}
        {pending ? "Guardando..." : "Guardar mi valoración →"}
      </Button>
    </form>
  );
}
