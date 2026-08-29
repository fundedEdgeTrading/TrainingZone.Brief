import { z } from "zod";
import type { AssessmentKind } from "@prisma/client";
import {
  ASSESSMENT_KIND_LABEL,
  DEFAULT_ASSESSMENT_CONFIG,
  customQuestionsForKind,
  isQuestionEnabled,
  questionsForKind,
  type AssessmentConfig,
  type CustomQuestionDef,
} from "./config";

export { ASSESSMENT_KIND_LABEL };

/**
 * Valoración inicial y revisiones (F3 §4.2), transcritas de los dos formularios
 * de Notion. Cuatro campos del original desaparecen: nombre, DNI y fecha ya los
 * tiene la app, y el tipo de valoración lo decide el hito, no la persona.
 */

/**
 * Serie temporal común a todas las valoraciones: es lo que se grafica de una
 * valoración a la siguiente, así que inicial y revisión tienen que preguntarlo
 * igual. El sueño se unifica a escala 1-5 (antes la inicial pedía horas y la
 * revisión una escala: mismo nombre, magnitudes distintas, ingraficables juntas).
 */
export const vitalsSchema = z.object({
  pesoKg: z.number().positive(),
  dolorActual: z.number().int().min(0).max(10),
  // Las preguntas que un centro puede apagar (`config.ts`) se declaran
  // opcionales: si no se hacen, no hay respuesta que validar. Que vuelvan a ser
  // obligatorias cuando sí se hacen lo impone `assessmentSchemaFor` — declararlo
  // aquí obligaría a mantener un esquema por combinación de configuración.
  calidadSueno: z.number().int().min(1).max(5).optional(),
  estres: z.number().int().min(1).max(5).optional(),
  energia: z.number().int().min(1).max(5).optional(),
  diasPorSemana: z.enum(["1", "2", "3", "MAS_DE_3"]).optional(),
});

export const PAIN_ZONES = [
  "CUELLO",
  "HOMBRO",
  "ESPALDA_ALTA",
  "LUMBAR",
  "CADERA",
  "RODILLA",
  "TOBILLO",
  "OTRO",
] as const;

export type PainZone = (typeof PAIN_ZONES)[number];

const text = z.string().trim();
const optionalText = text.max(2000).optional().default("");

/**
 * Marcas medibles que se toman durante la valoración. No viven en `answers`:
 * se propagan a PerformanceMetric porque lo que interesa es su evolución, no la
 * foto del día. Catálogo cerrado a propósito — un repetidor libre acaba
 * produciendo cuatro nombres distintos para la misma marca.
 */
export const PERFORMANCE_MARKS = [
  { key: "dominadas_reps", label: "Dominadas", unit: "reps" },
  { key: "flexiones_reps", label: "Flexiones", unit: "reps" },
  { key: "plancha_s", label: "Plancha isométrica", unit: "s" },
  { key: "circuito_agilidad_s", label: "Circuito de agilidad", unit: "s" },
] as const;

export type PerformanceMarkKey = (typeof PERFORMANCE_MARKS)[number]["key"];

const marksSchema = z
  .array(
    z.object({
      key: z.enum(PERFORMANCE_MARKS.map((m) => m.key) as [PerformanceMarkKey, ...PerformanceMarkKey[]]),
      value: z.number().nonnegative(),
    })
  )
  .default([]);

/**
 * Las dos secciones que el socio contesta sobre sí mismo. Viven fuera del
 * esquema completo porque son exactamente lo que él rellena en su primera
 * sesión en la app (`memberInitialPartSchema`): si se declararan en línea, la
 * parte del socio y la del entrenador podrían separarse sin que nada avisara, y
 * el formulario de autoservicio empezaría a pedir campos que no le tocan.
 */
export const perfilSchema = z.object({
  edad: z.number().int().min(14).max(100),
  sexo: z.enum(["HOMBRE", "MUJER", "OTRO"]),
  alturaCm: z.number().int().min(120).max(230),
  objetivoPrincipal: text.min(1, "Indica el objetivo principal.").max(200),
  objetivoSecundario: optionalText,
  motivacionReal: optionalText,
  queLeHariaAbandonar: optionalText,
});

export const experienciaSchema = z.object({
  nivelActividad: z.enum(["BAJO", "MEDIO", "ALTO"]).optional(),
  haEntrenadoAntes: z.boolean().optional(),
  anosExperiencia: z.number().min(0).max(70).default(0),
  tecnicaBasicos: z.enum(["BAJA", "MEDIA", "ALTA"]).optional(),
  ejerciciosNoTolera: optionalText,
});

/**
 * Lo que el socio rellena por su cuenta al entrar por primera vez (F-ALTA):
 * quién es, de dónde parte y cómo llega hoy. Deja fuera a propósito el
 * screening, el PAR-Q y las marcas físicas — el screening es dato de salud que
 * interpreta un profesional, el PAR-Q se firma con el entrenador delante y las
 * marcas (dominadas, plancha, circuito) se miden en el centro, no se recuerdan
 * desde el sofá. Es un subconjunto estricto de `initialAssessmentSchema`: lo
 * que se guarda aquí es el borrador que el entrenador encuentra ya escrito.
 */
export const memberInitialPartSchema = vitalsSchema.extend({
  perfil: perfilSchema,
  experiencia: experienciaSchema,
});

export type MemberInitialPartAnswers = z.infer<typeof memberInitialPartSchema>;

/**
 * Respuestas a las preguntas propias del centro (`AssessmentCustomQuestion`).
 * En el esquema base es un diccionario abierto porque aquí no se sabe qué
 * preguntas tiene cada organización: `assessmentSchemaFor` lo estrecha a las
 * suyas —con su tipo de respuesta— en el momento de guardar. Abierto también al
 * leer, para que una pregunta retirada no borre de la ficha lo ya contestado.
 */
const customAnswersRecord = z
  .record(z.string(), z.union([z.string(), z.number()]))
  .optional()
  .default({});

export const initialAssessmentSchema = vitalsSchema.extend({
  perfil: perfilSchema,
  experiencia: experienciaSchema,
  screening: z.object({
    cardiovascular: z.boolean(),
    hipertension: z.boolean(),
    diabetes: z.boolean(),
    medicacion: optionalText,
    cirugias: optionalText,
    lesionesActuales: optionalText,
    zonasDolor: z.array(z.enum(PAIN_ZONES)).default([]),
  }),
  marcas: marksSchema,
  cierre: z.object({
    notasEntrenador: optionalText,
    // PAR-Q: sin firma no hay valoración. Es la puerta del Art. 9, no una casilla más.
    consentimientoParq: z.literal(true, { error: "El PAR-Q debe firmarse para guardar la valoración." }),
    autorizacionImagen: z.boolean().optional(), // voluntaria y revocable, nunca junto al PAR-Q
  }),
  custom: customAnswersRecord,
});

export const reviewAssessmentSchema = vitalsSchema.extend({
  seguimiento: z.object({
    adherenciaPercibida: z.number().int().min(1).max(5).optional(),
    progresoPercibido: z.number().int().min(1).max(5).optional(),
    queHaMejorado: optionalText,
    obstaculos: optionalText,
    objetivoProximoPeriodo: optionalText,
  }),
  marcas: marksSchema,
  cierre: z.object({
    notasEntrenador: optionalText,
  }),
  custom: customAnswersRecord,
});

export type InitialAssessmentAnswers = z.infer<typeof initialAssessmentSchema>;
export type ReviewAssessmentAnswers = z.infer<typeof reviewAssessmentSchema>;
export type AssessmentAnswers = InitialAssessmentAnswers | ReviewAssessmentAnswers;

/**
 * Preguntas desactivables cuya respuesta no es texto libre: si el centro las
 * hace, tiene que haber respuesta. Las de texto no entran —una nota del
 * entrenador en blanco es una respuesta legítima— ni las que ya traen valor por
 * defecto (`anosExperiencia`, `marcas`).
 */
const REQUIRED_WHEN_ENABLED: string[] = [
  "calidadSueno",
  "estres",
  "energia",
  "diasPorSemana",
  "experiencia.nivelActividad",
  "experiencia.haEntrenadoAntes",
  "experiencia.tecnicaBasicos",
  "seguimiento.adherenciaPercibida",
  "seguimiento.progresoPercibido",
  "cierre.autorizacionImagen",
];

function valueAt(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc === null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

/** Esquema zod de la respuesta a una pregunta propia, según su tipo. */
function customAnswerSchema(question: CustomQuestionDef) {
  switch (question.type) {
    case "NUMBER":
      return z.number();
    case "SCALE_1_5":
      return z.number().int().min(1).max(5);
    default:
      return z.string().trim().max(2000);
  }
}

/**
 * Cuestionario de una organización concreta: el estándar sin lo que ha apagado,
 * más sus preguntas propias.
 *
 * El tipo declarado es el del cuestionario completo porque la parte propia no se
 * conoce hasta que se lee la configuración —son filas de base de datos, no
 * literales—. Lo que sí queda garantizado en ejecución es su forma: cada
 * respuesta propia se valida con el tipo con el que el centro creó la pregunta.
 */
export function assessmentSchemaFor(
  kind: AssessmentKind,
  config: AssessmentConfig = DEFAULT_ASSESSMENT_CONFIG
): z.ZodType<AssessmentAnswers> {
  const base = kind === "INITIAL" ? initialAssessmentSchema : reviewAssessmentSchema;
  const custom = customQuestionsForKind(kind, config.customQuestions);

  const customShape = Object.fromEntries(custom.map((q) => [q.key, customAnswerSchema(q).optional()]));
  // `catchall`: lo contestado a una pregunta que el centro haya retirado después
  // sigue viajando en `answers` en vez de desaparecer al primer guardado.
  const withCustom = base.extend({
    custom: z.object(customShape).catchall(z.union([z.string(), z.number()])).optional().default({}),
  });

  // Solo las de ESTE cuestionario: la autorización de imagen es de la inicial y
  // no se le reclama a una revisión, aunque las dos tengan sección de cierre.
  const required = questionsForKind(kind).filter((q) => REQUIRED_WHEN_ENABLED.includes(q.key));

  const schema = withCustom.superRefine((value, ctx) => {
    for (const question of required) {
      if (valueAt(value, question.key) !== undefined) continue;
      if (!isQuestionEnabled(config, question.key)) continue;
      ctx.addIssue({
        code: "custom",
        path: question.key.split("."),
        message: `Falta responder «${question.label}».`,
      });
    }

    const answers = (value as { custom?: Record<string, unknown> }).custom ?? {};
    for (const question of custom) {
      if (!question.required) continue;
      const answer = answers[question.key];
      if (answer === undefined || answer === "") {
        ctx.addIssue({
          code: "custom",
          path: ["custom", question.key],
          message: `Falta responder «${question.label}».`,
        });
      }
    }
  });

  return schema as unknown as z.ZodType<AssessmentAnswers>;
}

export function isInitialAnswers(
  kind: AssessmentKind,
  answers: AssessmentAnswers
): answers is InitialAssessmentAnswers {
  return kind === "INITIAL" && "perfil" in answers;
}

export const PAIN_ZONE_LABEL: Record<PainZone, string> = {
  CUELLO: "Cuello",
  HOMBRO: "Hombro",
  ESPALDA_ALTA: "Espalda alta",
  LUMBAR: "Zona lumbar",
  CADERA: "Cadera",
  RODILLA: "Rodilla",
  TOBILLO: "Tobillo",
  OTRO: "Otra zona",
};

/**
 * `HealthRecord.zone` se compara literalmente contra `AptitudeRule.injuryZone`
 * (lib/brief-queries.ts), así que la zona declarada tiene que escribirse con la
 * misma etiqueta que usa el catálogo de reglas o el Semáforo de Aptitud no se
 * entera. De ahí que LUMBAR sea "zona lumbar" y CUELLO "cervicales", y no lo
 * que dirían sus nombres. Las zonas que el catálogo lateraliza (hombro, rodilla,
 * tobillo) se guardan sin lado: el formulario no lo pregunta, y dirección puede
 * añadir la regla sin lado desde /health/aptitude-rules.
 */
export const PAIN_ZONE_TO_HEALTH_ZONE: Record<PainZone, string> = {
  CUELLO: "cervicales",
  HOMBRO: "hombro",
  ESPALDA_ALTA: "espalda alta",
  LUMBAR: "zona lumbar",
  CADERA: "cadera",
  RODILLA: "rodilla",
  TOBILLO: "tobillo",
  OTRO: "otra zona",
};

export const DAYS_PER_WEEK_LABEL: Record<string, string> = {
  "1": "1 día",
  "2": "2 días",
  "3": "3 días",
  MAS_DE_3: "Más de 3 días",
};
