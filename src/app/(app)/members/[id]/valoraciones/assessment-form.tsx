"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/kpi-card";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import {
  DAYS_PER_WEEK_LABEL,
  PAIN_ZONES,
  PAIN_ZONE_LABEL,
  PERFORMANCE_MARKS,
  type MemberInitialPartAnswers,
  type PainZone,
  type PerformanceMarkKey,
} from "@/lib/assessments/schemas";
import {
  DEFAULT_ASSESSMENT_CONFIG,
  customQuestionsForKind,
  isQuestionEnabled,
  type AssessmentConfig,
  type CustomQuestionDef,
} from "@/lib/assessments/config";
import { submitAssessmentAction } from "./actions";
import type { AssessmentKind } from "@prisma/client";

const SCALE_1_5 = ["1", "2", "3", "4", "5"];

function num(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}

/** Escala 1-5, la misma en todos los formularios desde F3 (roadmap §4.2). */
function ScaleField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {SCALE_1_5.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  required,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
}) {
  return (
    <label className="flex gap-3 items-start text-sm text-brand-text cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        required={required}
        onChange={(e) => onChange(e.target.checked)}
        className="w-[17px] h-[17px] mt-0.5 accent-tz-black cursor-pointer shrink-0"
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Pregunta propia del centro. El constructor es corto a propósito (texto,
 * número o escala 1-5): lo que se pedía era poder preguntar algo más, no un
 * generador de formularios.
 */
function CustomQuestionField({
  question,
  value,
  onChange,
}: {
  question: CustomQuestionDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const label = question.required ? `${question.label} ✱` : question.label;
  if (question.type === "SCALE_1_5") {
    return <ScaleField label={label} value={value || "3"} onChange={onChange} />;
  }
  if (question.type === "NUMBER") {
    return (
      <Field label={label}>
        <Input type="number" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  return (
    <Field label={label}>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function AssessmentForm({
  assessmentId,
  memberId,
  kind,
  config = DEFAULT_ASSESSMENT_CONFIG,
  draft = null,
}: {
  assessmentId: string;
  memberId: string;
  kind: AssessmentKind;
  /**
   * Cuestionario de este centro (F-VAL): qué preguntas del estándar hace y
   * cuáles ha añadido de su mano. Por defecto, el cuestionario de siempre.
   */
  config?: AssessmentConfig;
  /**
   * F-ALTA: lo que el socio ya contestó por su cuenta al entrar en la app. El
   * entrenador lo encuentra escrito y editable —no de solo lectura—: si al
   * medir en el centro resulta que el socio se puso 4 cm de más, corregirlo
   * ahora es más barato que arrastrar una altura falsa a todos sus IMC.
   */
  draft?: MemberInitialPartAnswers | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const isInitial = kind === "INITIAL";
  /** ¿Se hace esta pregunta del cuestionario estándar en este centro? */
  const on = (key: string) => isQuestionEnabled(config, key);
  const customQuestions = customQuestionsForKind(kind, config.customQuestions);

  // Constantes comunes a inicial y revisión: son la serie que se grafica.
  const [pesoKg, setPesoKg] = useState(draft ? String(draft.pesoKg) : "");
  const [dolorActual, setDolorActual] = useState(draft ? String(draft.dolorActual) : "0");
  // El borrador del socio puede no traer una constante que el centro apagó
  // después: `?? valor de siempre` en vez de un "undefined" pintado en el select.
  const [calidadSueno, setCalidadSueno] = useState(String(draft?.calidadSueno ?? "3"));
  const [estres, setEstres] = useState(String(draft?.estres ?? "3"));
  const [energia, setEnergia] = useState(String(draft?.energia ?? "3"));
  const [diasPorSemana, setDiasPorSemana] = useState(String(draft?.diasPorSemana ?? "2"));

  const [perfil, setPerfil] = useState({
    edad: draft ? String(draft.perfil.edad) : "",
    sexo: draft ? String(draft.perfil.sexo) : "MUJER",
    alturaCm: draft ? String(draft.perfil.alturaCm) : "",
    objetivoPrincipal: draft?.perfil.objetivoPrincipal ?? "",
    objetivoSecundario: draft?.perfil.objetivoSecundario ?? "",
    motivacionReal: draft?.perfil.motivacionReal ?? "",
    queLeHariaAbandonar: draft?.perfil.queLeHariaAbandonar ?? "",
  });
  const [experiencia, setExperiencia] = useState({
    nivelActividad: String(draft?.experiencia.nivelActividad ?? "MEDIO"),
    haEntrenadoAntes: draft?.experiencia.haEntrenadoAntes ?? false,
    anosExperiencia: String(draft?.experiencia.anosExperiencia ?? "0"),
    tecnicaBasicos: String(draft?.experiencia.tecnicaBasicos ?? "MEDIA"),
    ejerciciosNoTolera: draft?.experiencia.ejerciciosNoTolera ?? "",
  });
  const [screening, setScreening] = useState({
    cardiovascular: false,
    hipertension: false,
    diabetes: false,
    medicacion: "",
    cirugias: "",
    lesionesActuales: "",
  });
  const [zonasDolor, setZonasDolor] = useState<PainZone[]>([]);
  const [seguimiento, setSeguimiento] = useState({
    adherenciaPercibida: "3",
    progresoPercibido: "3",
    queHaMejorado: "",
    obstaculos: "",
    objetivoProximoPeriodo: "",
  });
  const [marcas, setMarcas] = useState<Record<PerformanceMarkKey, string>>({
    dominadas_reps: "",
    flexiones_reps: "",
    plancha_s: "",
    circuito_agilidad_s: "",
  });
  const [notasEntrenador, setNotasEntrenador] = useState("");
  // Respuestas a las preguntas propias del centro. Se guardan como texto
  // mientras se escribe y se convierten al tipo de la pregunta al enviar, igual
  // que el resto de campos numéricos del formulario.
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [consentimientoParq, setConsentimientoParq] = useState(false);
  const [autorizacionImagen, setAutorizacionImagen] = useState(false);

  function toggleZone(zone: PainZone) {
    setZonasDolor((zs) => (zs.includes(zone) ? zs.filter((z) => z !== zone) : [...zs, zone]));
  }

  /**
   * Lo que no se pregunta no se envía: una respuesta a una pregunta apagada
   * llegaría al servidor como un dato que nadie ha dado. El esquema del
   * servidor se arma con la misma configuración, así que tampoco la reclama.
   */
  function only<T extends object>(key: string, value: T): T | Record<string, never> {
    return on(key) ? value : {};
  }

  function buildAnswers() {
    const vitals = {
      pesoKg: num(pesoKg),
      dolorActual: num(dolorActual),
      ...only("calidadSueno", { calidadSueno: num(calidadSueno) }),
      ...only("estres", { estres: num(estres) }),
      ...only("energia", { energia: num(energia) }),
      ...only("diasPorSemana", { diasPorSemana }),
    };
    const marcasList = on("marcas")
      ? PERFORMANCE_MARKS.filter((m) => marcas[m.key].trim() !== "").map((m) => ({
          key: m.key,
          value: num(marcas[m.key]),
        }))
      : [];
    const custom = Object.fromEntries(
      customQuestions
        .filter((q) => (customAnswers[q.key] ?? "").trim() !== "")
        .map((q) => [q.key, q.type === "TEXT" ? customAnswers[q.key].trim() : num(customAnswers[q.key])])
    );

    if (!isInitial) {
      return {
        ...vitals,
        seguimiento: {
          ...only("seguimiento.adherenciaPercibida", { adherenciaPercibida: num(seguimiento.adherenciaPercibida) }),
          ...only("seguimiento.progresoPercibido", { progresoPercibido: num(seguimiento.progresoPercibido) }),
          ...only("seguimiento.queHaMejorado", { queHaMejorado: seguimiento.queHaMejorado }),
          ...only("seguimiento.obstaculos", { obstaculos: seguimiento.obstaculos }),
          ...only("seguimiento.objetivoProximoPeriodo", { objetivoProximoPeriodo: seguimiento.objetivoProximoPeriodo }),
        },
        marcas: marcasList,
        cierre: { ...only("cierre.notasEntrenador", { notasEntrenador }) },
        custom,
      };
    }

    return {
      ...vitals,
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
      screening: { ...screening, zonasDolor },
      marcas: marcasList,
      cierre: {
        ...only("cierre.notasEntrenador", { notasEntrenador }),
        consentimientoParq,
        ...only("cierre.autorizacionImagen", { autorizacionImagen }),
      },
      custom,
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await submitAssessmentAction(assessmentId, buildAnswers());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Valoración guardada.");
      router.push(`/members/${memberId}/valoraciones/${assessmentId}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Card title="Constantes" meta="Se grafican valoración a valoración">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Peso (kg)">
            <Input
              type="number"
              step="0.1"
              min="20"
              max="300"
              required
              value={pesoKg}
              onChange={(e) => setPesoKg(e.target.value)}
            />
          </Field>
          <Field label="Dolor actual (0-10)">
            <Input
              type="number"
              min="0"
              max="10"
              step="1"
              required
              value={dolorActual}
              onChange={(e) => setDolorActual(e.target.value)}
            />
          </Field>
          {on("diasPorSemana") && (
            <Field label="Días de entreno por semana">
              <Select value={diasPorSemana} onChange={(e) => setDiasPorSemana(e.target.value)}>
                {Object.entries(DAYS_PER_WEEK_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {on("calidadSueno") && (
            <ScaleField label="Calidad del sueño (1-5)" value={calidadSueno} onChange={setCalidadSueno} />
          )}
          {on("estres") && <ScaleField label="Estrés (1-5)" value={estres} onChange={setEstres} />}
          {on("energia") && <ScaleField label="Energía (1-5)" value={energia} onChange={setEnergia} />}
        </div>
      </Card>

      {isInitial && (
        <>
          <Card title="Perfil">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Edad">
                <Input
                  type="number"
                  min="14"
                  max="100"
                  required
                  value={perfil.edad}
                  onChange={(e) => setPerfil((p) => ({ ...p, edad: e.target.value }))}
                />
              </Field>
              <Field label="Sexo">
                <Select value={perfil.sexo} onChange={(e) => setPerfil((p) => ({ ...p, sexo: e.target.value }))}>
                  <option value="MUJER">Mujer</option>
                  <option value="HOMBRE">Hombre</option>
                  <option value="OTRO">Otro</option>
                </Select>
              </Field>
              <Field label="Altura (cm)">
                <Input
                  type="number"
                  min="120"
                  max="230"
                  required
                  value={perfil.alturaCm}
                  onChange={(e) => setPerfil((p) => ({ ...p, alturaCm: e.target.value }))}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label="Objetivo principal" hint="Se guarda también como objetivo del socio">
                <Input
                  required
                  value={perfil.objetivoPrincipal}
                  onChange={(e) => setPerfil((p) => ({ ...p, objetivoPrincipal: e.target.value }))}
                />
              </Field>
              {on("perfil.objetivoSecundario") && (
                <Field label="Objetivo secundario">
                  <Input
                    value={perfil.objetivoSecundario}
                    onChange={(e) => setPerfil((p) => ({ ...p, objetivoSecundario: e.target.value }))}
                  />
                </Field>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              {on("perfil.motivacionReal") && (
                <Field label="Motivación real">
                  <Textarea
                    value={perfil.motivacionReal}
                    onChange={(e) => setPerfil((p) => ({ ...p, motivacionReal: e.target.value }))}
                  />
                </Field>
              )}
              {on("perfil.queLeHariaAbandonar") && (
                <Field label="Qué le haría abandonar">
                  <Textarea
                    value={perfil.queLeHariaAbandonar}
                    onChange={(e) => setPerfil((p) => ({ ...p, queLeHariaAbandonar: e.target.value }))}
                  />
                </Field>
              )}
            </div>
          </Card>

          <Card title="Experiencia">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {on("experiencia.nivelActividad") && (
              <Field label="Nivel de actividad">
                <Select
                  value={experiencia.nivelActividad}
                  onChange={(e) => setExperiencia((x) => ({ ...x, nivelActividad: e.target.value }))}
                >
                  <option value="BAJO">Bajo</option>
                  <option value="MEDIO">Medio</option>
                  <option value="ALTO">Alto</option>
                </Select>
              </Field>
              )}
              {on("experiencia.anosExperiencia") && (
              <Field label="Años de experiencia">
                <Input
                  type="number"
                  min="0"
                  max="70"
                  step="0.5"
                  value={experiencia.anosExperiencia}
                  onChange={(e) => setExperiencia((x) => ({ ...x, anosExperiencia: e.target.value }))}
                />
              </Field>
              )}
              {on("experiencia.tecnicaBasicos") && (
              <Field label="Técnica en básicos">
                <Select
                  value={experiencia.tecnicaBasicos}
                  onChange={(e) => setExperiencia((x) => ({ ...x, tecnicaBasicos: e.target.value }))}
                >
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                </Select>
              </Field>
              )}
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {on("experiencia.haEntrenadoAntes") && (
                <Checkbox
                  label="Ha entrenado antes de forma regular"
                  checked={experiencia.haEntrenadoAntes}
                  onChange={(v) => setExperiencia((x) => ({ ...x, haEntrenadoAntes: v }))}
                />
              )}
              {on("experiencia.ejerciciosNoTolera") && (
                <Field label="Ejercicios que no tolera">
                  <Textarea
                    value={experiencia.ejerciciosNoTolera}
                    onChange={(e) => setExperiencia((x) => ({ ...x, ejerciciosNoTolera: e.target.value }))}
                  />
                </Field>
              )}
            </div>
          </Card>

          <Card title="Screening de salud" meta="Alimenta el Semáforo de Aptitud">
            <p className="text-[13px] text-brand-muted -mt-3 mb-4">
              Lo que se declare aquí se registra como dato de salud del socio (Art. 9 RGPD) y pasa al Semáforo de
              Aptitud y al Session Brief de quien le entrene.
            </p>
            <div className="flex flex-col gap-3">
              <Checkbox
                label="Patología cardiovascular"
                checked={screening.cardiovascular}
                onChange={(v) => setScreening((s) => ({ ...s, cardiovascular: v }))}
              />
              <Checkbox
                label="Hipertensión"
                checked={screening.hipertension}
                onChange={(v) => setScreening((s) => ({ ...s, hipertension: v }))}
              />
              <Checkbox
                label="Diabetes"
                checked={screening.diabetes}
                onChange={(v) => setScreening((s) => ({ ...s, diabetes: v }))}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
              <Field label="Medicación">
                <Textarea
                  value={screening.medicacion}
                  onChange={(e) => setScreening((s) => ({ ...s, medicacion: e.target.value }))}
                />
              </Field>
              <Field label="Cirugías">
                <Textarea
                  value={screening.cirugias}
                  onChange={(e) => setScreening((s) => ({ ...s, cirugias: e.target.value }))}
                />
              </Field>
              <Field label="Lesiones actuales">
                <Textarea
                  value={screening.lesionesActuales}
                  onChange={(e) => setScreening((s) => ({ ...s, lesionesActuales: e.target.value }))}
                />
              </Field>
            </div>
            <div className="mt-4">
              <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted mb-1.5">
                Zonas de dolor
              </span>
              <div className="flex flex-wrap gap-2">
                {PAIN_ZONES.map((zone) => {
                  const active = zonasDolor.includes(zone);
                  return (
                    <button
                      key={zone}
                      type="button"
                      onClick={() => toggleZone(zone)}
                      className={`rounded-pill px-3.5 py-1.5 text-sm font-semibold border transition-colors duration-200 ${
                        active
                          ? "bg-tz-black text-tz-bone border-tz-black"
                          : "bg-white text-brand-text-2 border-brand-border hover:border-brand-ink"
                      }`}
                    >
                      {PAIN_ZONE_LABEL[zone]}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </>
      )}

      {!isInitial && (
        <Card title="Seguimiento">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {on("seguimiento.adherenciaPercibida") && (
              <ScaleField
                label="Adherencia percibida (1-5)"
                value={seguimiento.adherenciaPercibida}
                onChange={(v) => setSeguimiento((s) => ({ ...s, adherenciaPercibida: v }))}
              />
            )}
            {on("seguimiento.progresoPercibido") && (
              <ScaleField
                label="Progreso percibido (1-5)"
                value={seguimiento.progresoPercibido}
                onChange={(v) => setSeguimiento((s) => ({ ...s, progresoPercibido: v }))}
              />
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {on("seguimiento.queHaMejorado") && (
              <Field label="Qué ha mejorado">
                <Textarea
                  value={seguimiento.queHaMejorado}
                  onChange={(e) => setSeguimiento((s) => ({ ...s, queHaMejorado: e.target.value }))}
                />
              </Field>
            )}
            {on("seguimiento.obstaculos") && (
              <Field label="Obstáculos">
                <Textarea
                  value={seguimiento.obstaculos}
                  onChange={(e) => setSeguimiento((s) => ({ ...s, obstaculos: e.target.value }))}
                />
              </Field>
            )}
          </div>
          {on("seguimiento.objetivoProximoPeriodo") && (
            <Field
              className="mt-4"
              label="Objetivo del próximo periodo"
              hint="Se guarda también como objetivo del socio"
            >
              <Input
                value={seguimiento.objetivoProximoPeriodo}
                onChange={(e) => setSeguimiento((s) => ({ ...s, objetivoProximoPeriodo: e.target.value }))}
              />
            </Field>
          )}
        </Card>
      )}

      {on("marcas") && (
        <Card title="Marcas" meta="Opcionales · serie propia">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {PERFORMANCE_MARKS.map((mark) => (
              <Field key={mark.key} label={`${mark.label} (${mark.unit})`}>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={marcas[mark.key]}
                  onChange={(e) => setMarcas((m) => ({ ...m, [mark.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>
        </Card>
      )}

      {customQuestions.length > 0 && (
        <Card title="Preguntas del centro" meta="Configuradas en Organización · Valoraciones">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {customQuestions.map((question) => (
              <CustomQuestionField
                key={question.key}
                question={question}
                value={customAnswers[question.key] ?? ""}
                onChange={(v) => setCustomAnswers((a) => ({ ...a, [question.key]: v }))}
              />
            ))}
          </div>
        </Card>
      )}

      <Card title="Cierre">
        {on("cierre.notasEntrenador") && (
          <Field label="Notas del entrenador">
            <Textarea value={notasEntrenador} onChange={(e) => setNotasEntrenador(e.target.value)} />
          </Field>
        )}
        {isInitial && (
          <div className="flex flex-col gap-3 mt-4">
            <Checkbox
              required
              checked={consentimientoParq}
              onChange={setConsentimientoParq}
              label={
                <span>
                  <span className="font-bold">PAR-Q y consentimiento de datos de salud ✱</span> — el socio declara que
                  la información de salud es veraz y autoriza su tratamiento para diseñar su entrenamiento. Sin esta
                  firma la valoración no se puede guardar.
                </span>
              }
            />
            {on("cierre.autorizacionImagen") && (
              <Checkbox
                checked={autorizacionImagen}
                onChange={setAutorizacionImagen}
                label={
                  <span>
                    <span className="font-bold">Autorización de imagen</span> — fotos de evolución en su ficha y su
                    portal. Voluntaria y revocable en cualquier momento desde el portal del socio.
                  </span>
                }
              />
            )}
          </div>
        )}
      </Card>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <ButtonSpinner />}
          {pending ? "Guardando..." : "Guardar valoración"}
        </Button>
      </div>
    </form>
  );
}
