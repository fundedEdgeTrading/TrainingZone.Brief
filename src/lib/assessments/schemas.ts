import { z } from "zod";
import type { AssessmentKind } from "@prisma/client";

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
  calidadSueno: z.number().int().min(1).max(5),
  estres: z.number().int().min(1).max(5),
  energia: z.number().int().min(1).max(5),
  diasPorSemana: z.enum(["1", "2", "3", "MAS_DE_3"]),
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

export const initialAssessmentSchema = vitalsSchema.extend({
  perfil: z.object({
    edad: z.number().int().min(14).max(100),
    sexo: z.enum(["HOMBRE", "MUJER", "OTRO"]),
    alturaCm: z.number().int().min(120).max(230),
    objetivoPrincipal: text.min(1, "Indica el objetivo principal.").max(200),
    objetivoSecundario: optionalText,
    motivacionReal: optionalText,
    queLeHariaAbandonar: optionalText,
  }),
  experiencia: z.object({
    nivelActividad: z.enum(["BAJO", "MEDIO", "ALTO"]),
    haEntrenadoAntes: z.boolean(),
    anosExperiencia: z.number().min(0).max(70).default(0),
    tecnicaBasicos: z.enum(["BAJA", "MEDIA", "ALTA"]),
    ejerciciosNoTolera: optionalText,
  }),
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
    autorizacionImagen: z.boolean(), // voluntaria y revocable, nunca junto al PAR-Q
  }),
});

export const reviewAssessmentSchema = vitalsSchema.extend({
  seguimiento: z.object({
    adherenciaPercibida: z.number().int().min(1).max(5),
    progresoPercibido: z.number().int().min(1).max(5),
    queHaMejorado: optionalText,
    obstaculos: optionalText,
    objetivoProximoPeriodo: optionalText,
  }),
  marcas: marksSchema,
  cierre: z.object({
    notasEntrenador: optionalText,
  }),
});

export type InitialAssessmentAnswers = z.infer<typeof initialAssessmentSchema>;
export type ReviewAssessmentAnswers = z.infer<typeof reviewAssessmentSchema>;
export type AssessmentAnswers = InitialAssessmentAnswers | ReviewAssessmentAnswers;

export function schemaForKind(kind: AssessmentKind) {
  return kind === "INITIAL" ? initialAssessmentSchema : reviewAssessmentSchema;
}

export function isInitialAnswers(
  kind: AssessmentKind,
  answers: AssessmentAnswers
): answers is InitialAssessmentAnswers {
  return kind === "INITIAL" && "perfil" in answers;
}

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  INITIAL: "Valoración inicial",
  M1: "Revisión · 1 mes",
  M3: "Revisión · 3 meses",
  M6: "Revisión · 6 meses",
  M9: "Revisión · 9 meses",
  Y1: "Revisión · aniversario",
};

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
