import { z } from "zod";
import { EP_PROFILES } from "@/lib/ai/ep-profile";

/**
 * Espejo en Zod del árbol Mesocycle → Phase → Day → Block → Exercise de
 * `schema.prisma`. Se usa como `output_config.format` de la llamada a la API:
 * es lo que convierte la respuesta en un plan editable campo a campo en vez de
 * un bloque de texto que el entrenador solo puede reescribir entero.
 *
 * Los campos que en Prisma son `String?` van aquí como `.nullable()` y no como
 * `.optional()`: los structured outputs los exigen presentes, y un `null`
 * explícito distingue "el modelo no propone carga" de "se olvidó del campo".
 */
export const MesocycleExerciseSchema = z.object({
  name: z.string(),
  sets: z.number().int(),
  reps: z.string().describe('Repeticiones o dosis: "8-10", "AMRAP 30s", "400 m"'),
  load: z.string().nullable().describe("Carga propuesta, o null si es a criterio del entrenador"),
  description: z.string().describe("Cómo se ejecuta, en una o dos frases"),
  rationale: z
    .string()
    .describe(
      "Por qué este ejercicio para ESTE socio, con su referencia metodológica. " +
        "Si el screening condiciona la elección (agarre, rango, apoyo), se dice aquí."
    ),
});

export const MesocycleBlockSchema = z.object({
  name: z.string().describe('Nombre del bloque: "Calentamiento", "Fuerza principal", "Metcon"'),
  durationMin: z.number().int(),
  exercises: z.array(MesocycleExerciseSchema).min(1),
});

export const MesocycleDaySchema = z.object({
  label: z.string().describe('"Lunes", "Día 1"...'),
  venue: z.string().describe('Dónde entrena ese día, tomado de la disponibilidad: "TZ" | "Gym" | ...'),
  focus: z.string(),
  warmup: z
    .array(z.string())
    .min(1)
    .describe("Calentamiento del día, un elemento por movimiento"),
  blocks: z.array(MesocycleBlockSchema).min(1),
});

export const MesocyclePhaseSchema = z.object({
  name: z.string(),
  weekFrom: z.number().int(),
  weekTo: z.number().int(),
  notes: z.string().nullable(),
  days: z.array(MesocycleDaySchema).min(1),
});

export const MesocyclePlanSchema = z.object({
  title: z.string(),
  objective: z.string(),
  profile: z
    .enum(EP_PROFILES)
    .describe("Perfil Training Zone con el que se ha programado este mesociclo; repite el que se te ha indicado."),
  safetyCriteria: z
    .array(z.string())
    .describe("Lo que NO se puede programar, heredado del screening. Vacío si no hay criterios clínicos."),
  weeklyLayout: z
    .array(z.string())
    .min(1)
    .describe('Reparto semanal, un elemento por día: "Lun TZ", "Mar Gym"...'),
  milestones: z
    .array(z.object({ week: z.number().int(), milestone: z.string() }))
    .min(1)
    .describe("Hoja de ruta: semana → hito medible"),
  phases: z.array(MesocyclePhaseSchema).min(1),
});

export type MesocyclePlan = z.infer<typeof MesocyclePlanSchema>;
export type MesocyclePlanPhase = z.infer<typeof MesocyclePhaseSchema>;
export type MesocyclePlanDay = z.infer<typeof MesocycleDaySchema>;
export type MesocyclePlanBlock = z.infer<typeof MesocycleBlockSchema>;
export type MesocyclePlanExercise = z.infer<typeof MesocycleExerciseSchema>;
