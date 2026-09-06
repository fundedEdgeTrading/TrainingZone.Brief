import { z } from "zod";
import type { AssessmentKind, InjuryZone, Laterality } from "@prisma/client";
import { LATERALITIES, defaultSideFor } from "@/lib/injury-zones";
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

/** El enum `Laterality` en la forma que zod necesita para validar la respuesta. */
const LATERALITY_VALUES = LATERALITIES as [Laterality, ...Laterality[]];

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


/**
 * E3-11 · Patrones de movimiento, movilidad y cargas de referencia.
 *
 * De los SIETE patrones que la propia metodología exige (bisagra, sentadilla,
 * los dos empujes, las dos tracciones y marcha/lunge — ver
 * `src/lib/ai/methodology/04-reglas-programacion.md`) no se evaluaba NINGUNO. Lo
 * más cercano era `experiencia.tecnicaBasicos: BAJA|MEDIA|ALTA`, una
 * autopercepción, y las marcas eran cuatro: dominadas, flexiones, plancha y
 * circuito de agilidad. Ni bisagra, ni sentadilla, ni empuje horizontal, ni
 * movilidad de tobillo u hombro, ni una sola carga de referencia.
 *
 * El bloque está pensado para rellenarse en menos de un minuto con el socio
 * delante: siete toques, tres toques y los kilos que haya.
 */
export const MOVEMENT_PATTERNS = [
  "BISAGRA",
  "SENTADILLA",
  "EMPUJE_HORIZONTAL",
  "EMPUJE_VERTICAL",
  "TRACCION_HORIZONTAL",
  "TRACCION_VERTICAL",
  "MARCHA_LUNGE",
] as const;

export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const MOVEMENT_PATTERN_LABEL: Record<MovementPattern, string> = {
  BISAGRA: "Bisagra de cadera",
  SENTADILLA: "Sentadilla",
  EMPUJE_HORIZONTAL: "Empuje horizontal",
  EMPUJE_VERTICAL: "Empuje vertical",
  TRACCION_HORIZONTAL: "Tracción horizontal",
  TRACCION_VERTICAL: "Tracción vertical",
  MARCHA_LUNGE: "Marcha / lunge",
};

/** Tres estados, no una nota del 1 al 10: es lo que se puede juzgar de un vistazo. */
export const PATTERN_EXECUTIONS = ["EJECUTA", "CON_REGRESION", "NO_EJECUTA"] as const;
export type PatternExecution = (typeof PATTERN_EXECUTIONS)[number];

export const PATTERN_EXECUTION_LABEL: Record<PatternExecution, string> = {
  EJECUTA: "Ejecuta",
  CON_REGRESION: "Con regresión",
  NO_EJECUTA: "No ejecuta",
};

/** Pasa / no pasa. Tres chequeos, no una batería de fisioterapia. */
export const MOBILITY_CHECKS = ["TOBILLO", "CADERA", "HOMBRO"] as const;
export type MobilityCheck = (typeof MOBILITY_CHECKS)[number];

export const MOBILITY_CHECK_LABEL: Record<MobilityCheck, string> = {
  TOBILLO: "Tobillo (rodilla a la pared)",
  CADERA: "Cadera (sentadilla profunda sin apoyo)",
  HOMBRO: "Hombro (flexión sobre cabeza contra pared)",
};

const patternResultSchema = z.object({
  nivel: z.enum(PATTERN_EXECUTIONS),
  nota: text.max(200).optional().default(""),
});

export const movimientoSchema = z.object({
  patrones: z.partialRecord(z.enum(MOVEMENT_PATTERNS), patternResultSchema).optional().default({}),
  movilidad: z.partialRecord(z.enum(MOBILITY_CHECKS), z.boolean()).optional().default({}),
  /** Kilos de referencia por patrón. La FECHA es la de la valoración, y por eso
   *  se propagan a `PerformanceMetric`: es lo que los hace comparables entre
   *  valoraciones sin releer todos los `answers`. */
  cargas: z.partialRecord(z.enum(MOVEMENT_PATTERNS), z.number().nonnegative()).optional().default({}),
});

export type MovimientoAnswers = z.infer<typeof movimientoSchema>;

/** Clave de `PerformanceMetric` para la carga de referencia de un patrón. */
export function loadMetricKey(pattern: MovementPattern): string {
  return `carga_${pattern.toLowerCase()}`;
}

export const LOAD_METRIC_KEYS = MOVEMENT_PATTERNS.map(loadMetricKey);

/**
 * Screening clínico. Vive fuera de `initialAssessmentSchema` porque desde E3-06
 * lo pregunta TAMBIÉN la revisión: una lumbalgia que aparece en el mes 4 tiene
 * que entrar en el semáforo sin que nadie la teclee a mano en la ficha.
 */
export const screeningSchema = z.object({
  cardiovascular: z.boolean(),
  hipertension: z.boolean(),
  diabetes: z.boolean(),
  medicacion: optionalText,
  cirugias: optionalText,
  lesionesActuales: optionalText,
  zonasDolor: z.array(z.enum(PAIN_ZONES)).default([]),
  // E3-02: el lado va APARTE de la zona. La valoración escribía "hombro" sin
  // lado mientras el catálogo de reglas estaba lateralizado, y de las ocho
  // zonas solo dos encontraban regla. Ahora se pregunta lo que hay que
  // preguntar, y la zona sigue siendo la misma para los dos lados.
  lateralidadDolor: z.partialRecord(z.enum(PAIN_ZONES), z.enum(LATERALITY_VALUES)).optional().default({}),
});

export type ScreeningAnswers = z.infer<typeof screeningSchema>;

export const initialAssessmentSchema = vitalsSchema.extend({
  /** E3-11 · opcional para no invalidar las valoraciones ya guardadas. */
  movimiento: movimientoSchema.optional(),
  perfil: perfilSchema,
  experiencia: experienciaSchema,
  screening: screeningSchema,
  marcas: marksSchema,
  cierre: z.object({
    notasEntrenador: optionalText,
    // PAR-Q: sin firma no hay valoración. Es la puerta del Art. 9, no una casilla más.
    consentimientoParq: z.literal(true, { error: "El PAR-Q debe firmarse para guardar la valoración." }),
    autorizacionImagen: z.boolean().optional(), // voluntaria y revocable, nunca junto al PAR-Q
  }),
  custom: customAnswersRecord,
});

/**
 * Puntuación por ejes del entrenador (E3-07). Vivía en `SessionDebrief`, donde
 * el color de la sesión se DERIVABA de su media: promediar movilidad con
 * actitud no significa nada, y rellenar solo el RPE dejaba al socio marcado
 * "regular" para siempre. Los ejes son una valoración del periodo, no un gesto
 * de sala, así que se puntúan aquí — con el socio delante y una vez al mes, no
 * ocho deslizadores después de cada clase.
 *
 * Todos opcionales: el bloque se puede dejar en blanco sin bloquear la
 * valoración.
 */
export const ejesSchema = z.object({
  esfuerzoPercibido: z.number().int().min(1).max(10).optional(),
  tecnica: z.number().int().min(1).max(10).optional(),
  actitud: z.number().int().min(1).max(10).optional(),
  energia: z.number().int().min(1).max(10).optional(),
  movilidad: z.number().int().min(1).max(10).optional(),
  dolor: z.number().int().min(1).max(10).optional(),
  adherencia: z.number().int().min(1).max(10).optional(),
  progreso: z.number().int().min(1).max(10).optional(),
});

export type EjesAnswers = z.infer<typeof ejesSchema>;

export const EJE_LABEL: Record<keyof EjesAnswers, string> = {
  esfuerzoPercibido: "Esfuerzo percibido (RPE)",
  tecnica: "Técnica",
  actitud: "Actitud",
  energia: "Energía",
  movilidad: "Movilidad",
  dolor: "Dolor",
  adherencia: "Adherencia",
  progreso: "Progreso",
};

export const EJE_KEYS = Object.keys(EJE_LABEL) as (keyof EjesAnswers)[];

export const reviewAssessmentSchema = vitalsSchema.extend({
  /** E3-11 · también en la revisión: sin repetirlo no hay histórico que comparar. */
  movimiento: movimientoSchema.optional(),
  /** E3-07: los ocho ejes, fuera del debrief de sesión. Opcional para no
   *  invalidar las revisiones ya guardadas. */
  ejes: ejesSchema.optional(),
  /**
   * E3-06 · la revisión vuelve a preguntar por lesiones. Opcional a propósito:
   * las revisiones ya guardadas no lo llevan, y exigirlo las dejaría sin detalle
   * en la ficha (`parseAnswers` devolvería null). Lo que sí garantiza el
   * formulario es que las nuevas siempre lo traen.
   */
  screening: screeningSchema.optional(),
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
 * Las zonas de dolor del cuestionario son un vocabulario de PREGUNTA (lo que se
 * le dice al socio); `InjuryZone` es el vocabulario de DATO, el que empareja con
 * las reglas de aptitud. Este mapa es el único puente entre los dos: mientras
 * fueron dos textos libres comparados por igualdad, seis de las ocho zonas no
 * encontraban regla y nadie veía el error (E3-02).
 */
export const PAIN_ZONE_TO_INJURY_ZONE: Record<PainZone, InjuryZone> = {
  CUELLO: "CERVICALES",
  HOMBRO: "HOMBRO",
  ESPALDA_ALTA: "DORSAL",
  LUMBAR: "LUMBAR",
  CADERA: "CADERA",
  RODILLA: "RODILLA",
  TOBILLO: "TOBILLO",
  OTRO: "OTRA",
};

/** De vuelta: qué zona del cuestionario representa una zona del catálogo.
 *  PARCIAL a propósito — el catálogo tiene zonas que el cuestionario no
 *  pregunta (codo, muñeca, ingle, gemelo...), y una lesión ahí NO puede
 *  resolverse por no aparecer marcada en una revisión que ni la ofrece. */
export const INJURY_ZONE_TO_PAIN_ZONE: Partial<Record<InjuryZone, PainZone>> = Object.fromEntries(
  (Object.entries(PAIN_ZONE_TO_INJURY_ZONE) as [PainZone, InjuryZone][]).map(([pain, injury]) => [injury, pain])
) as Partial<Record<InjuryZone, PainZone>>;

/** Zonas del cuestionario que sí tienen lado, y por tanto lo preguntan. */
export function painZoneNeedsSide(zone: PainZone): boolean {
  return defaultSideFor(PAIN_ZONE_TO_INJURY_ZONE[zone]) === null;
}

export const DAYS_PER_WEEK_LABEL: Record<string, string> = {
  "1": "1 día",
  "2": "2 días",
  "3": "3 días",
  MAS_DE_3: "Más de 3 días",
};
