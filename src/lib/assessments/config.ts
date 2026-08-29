import type { AssessmentKind, AssessmentQuestionScope, AssessmentQuestionType } from "@prisma/client";
import { addMonthsClamped } from "@/lib/date-utils";

/**
 * Qué pregunta cada centro y cada cuánto (F3 §4.2, configurable desde F-VAL).
 *
 * Hasta aquí la escalera de hitos y el cuestionario eran dos constantes en el
 * código: cambiar "revisión a los 9 meses" por "a los 10" era un despliegue, y
 * un centro que no mide la plancha isométrica no tenía forma de quitarla del
 * formulario. Esto lo convierte en configuración por organización siguiendo el
 * patrón de `CheckinScheduleConfig`: **la fila solo existe cuando el centro se
 * aparta del estándar**, y su ausencia es exactamente el comportamiento de
 * siempre. Una organización que nunca abra la pantalla no necesita filas
 * sembradas ni migración de datos.
 *
 * Este módulo es puro a propósito —no toca Prisma— porque lo importa también el
 * formulario, que es un componente de cliente. La lectura de base de datos vive
 * en `queries.ts` (`getAssessmentConfig`).
 */

// ---------- Hitos ----------

export type AssessmentMilestoneDef = {
  /** Clave estable. Los estándar reusan el valor del enum (`INITIAL`, `M6`…). */
  key: string;
  /** Enum con el que se guarda el Assessment; los añadidos por el centro van como CUSTOM. */
  kind: AssessmentKind;
  label: string;
  /** Meses desde el alta a los que vence. */
  months: number;
  /** Falso en los hitos que ha añadido el centro. */
  standard: boolean;
};

/** Escalera estándar: la de siempre, y el valor por defecto de toda organización. */
export const STANDARD_MILESTONES: AssessmentMilestoneDef[] = [
  { key: "INITIAL", kind: "INITIAL", label: "Valoración inicial", months: 0, standard: true },
  { key: "M1", kind: "M1", label: "Revisión · 1 mes", months: 1, standard: true },
  { key: "M3", kind: "M3", label: "Revisión · 3 meses", months: 3, standard: true },
  { key: "M6", kind: "M6", label: "Revisión · 6 meses", months: 6, standard: true },
  { key: "M9", kind: "M9", label: "Revisión · 9 meses", months: 9, standard: true },
  { key: "Y1", kind: "Y1", label: "Revisión · aniversario", months: 12, standard: true },
];

const STANDARD_BY_KEY = new Map(STANDARD_MILESTONES.map((m) => [m.key, m]));
const STANDARD_ORDER = new Map(STANDARD_MILESTONES.map((m, i) => [m.key, i]));

export const ASSESSMENT_KIND_LABEL: Record<AssessmentKind, string> = {
  INITIAL: "Valoración inicial",
  M1: "Revisión · 1 mes",
  M3: "Revisión · 3 meses",
  M6: "Revisión · 6 meses",
  M9: "Revisión · 9 meses",
  Y1: "Revisión · aniversario",
  // Un hito propio del centro: su nombre lo pone él, y vive en AssessmentMilestone.
  CUSTOM: "Revisión",
};

/** Fila de `AssessmentMilestone` tal y como la necesita la resolución. */
export type AssessmentMilestoneRow = { key: string; label: string; months: number };

/**
 * Catálogo efectivo de hitos de una organización.
 *
 * Una fila con la clave de un hito estándar lo reescribe (meses y nombre); una
 * fila con clave propia añade uno nuevo. Los estándar están siempre —esta
 * historia no cubre borrarlos— y el orden lo marca el vencimiento, no el orden
 * de creación: un hito a los 18 meses cae detrás del aniversario aunque se haya
 * dado de alta hoy.
 */
export function resolveMilestones(rows: AssessmentMilestoneRow[]): AssessmentMilestoneDef[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const standard = STANDARD_MILESTONES.map((m) => {
    const row = byKey.get(m.key);
    if (!row) return m;
    return { ...m, months: row.months, label: row.label.trim() || m.label };
  });

  const added = rows
    .filter((r) => !STANDARD_BY_KEY.has(r.key))
    .map<AssessmentMilestoneDef>((r) => ({
      key: r.key,
      kind: "CUSTOM",
      label: r.label,
      months: r.months,
      standard: false,
    }));

  return [...standard, ...added].sort(
    (a, b) => a.months - b.months || orderIndex(a) - orderIndex(b) || a.key.localeCompare(b.key)
  );
}

/** Los estándar mantienen su orden entre sí cuando dos hitos vencen el mismo mes. */
function orderIndex(m: AssessmentMilestoneDef): number {
  return STANDARD_ORDER.get(m.key) ?? STANDARD_MILESTONES.length;
}

/**
 * Fecha en la que vence un hito para un socio dado de alta ese día.
 *
 * El recorte al último día del mes NO es opcional: con `setMonth` a secas, el
 * hito de un mes de un alta el 31 de enero cae el 3 de marzo — otro mes — y la
 * valoración de febrero no existe para nadie (F4 §5.2, cubierto por
 * src/lib/date-utils.test.ts).
 */
export function dueDateForMilestone(joinedAt: Date, milestone: { months: number }): Date {
  return addMonthsClamped(joinedAt, milestone.months);
}

/** Clave del hito de una valoración ya guardada: los estándar la llevan en `kind`. */
export function milestoneKeyOf(assessment: { kind: AssessmentKind; milestoneKey?: string | null }): string {
  return assessment.milestoneKey ?? assessment.kind;
}

/** Nombre con el que se enseña una valoración, con el que le haya puesto el centro. */
export function milestoneLabelOf(
  assessment: { kind: AssessmentKind; milestoneKey?: string | null },
  milestones: AssessmentMilestoneDef[]
): string {
  const key = milestoneKeyOf(assessment);
  return milestones.find((m) => m.key === key)?.label ?? ASSESSMENT_KIND_LABEL[assessment.kind];
}

/**
 * Clave para un hito nuevo a partir de sus meses: `M18`, `M24`… Es legible en la
 * base de datos y hace imposible tener dos hitos distintos al mismo vencimiento,
 * que es justo lo que confundiría al cron (`@@unique([orgId, key])`).
 */
export function milestoneKeyForMonths(months: number): string {
  return `M${months}`;
}

// ---------- Preguntas del cuestionario estándar ----------

/** A qué valoraciones aplica una pregunta. */
export type QuestionScope = AssessmentQuestionScope;

export type StandardQuestion = {
  /** Ruta dentro de `answers`: `estres`, `perfil.motivacionReal`… */
  key: string;
  label: string;
  section: string;
  scope: QuestionScope;
  /**
   * Motivo por el que no se puede apagar. Son las preguntas que alimentan otro
   * módulo (peso, screening) o que sostienen un requisito legal (PAR-Q):
   * quitarlas no simplificaría el formulario, rompería lo que hay detrás.
   */
  locked?: string;
};

/**
 * Catálogo de lo que pregunta el cuestionario de `schemas.ts`, para poder
 * activarlo y desactivarlo desde la app. El orden es el del formulario.
 */
export const STANDARD_QUESTIONS: StandardQuestion[] = [
  { key: "pesoKg", label: "Peso (kg)", section: "Constantes", scope: "ALL", locked: "Es la serie de peso de la ficha" },
  {
    key: "dolorActual",
    label: "Dolor actual (0-10)",
    section: "Constantes",
    scope: "ALL",
    locked: "Gradúa la severidad de los registros de salud",
  },
  { key: "calidadSueno", label: "Calidad del sueño (1-5)", section: "Constantes", scope: "ALL" },
  { key: "estres", label: "Estrés (1-5)", section: "Constantes", scope: "ALL" },
  { key: "energia", label: "Energía (1-5)", section: "Constantes", scope: "ALL" },
  { key: "diasPorSemana", label: "Días de entreno por semana", section: "Constantes", scope: "ALL" },

  { key: "perfil.edad", label: "Edad", section: "Perfil", scope: "INITIAL", locked: "Va a la ficha del socio" },
  { key: "perfil.sexo", label: "Sexo", section: "Perfil", scope: "INITIAL", locked: "Va a la ficha del socio" },
  {
    key: "perfil.alturaCm",
    label: "Altura (cm)",
    section: "Perfil",
    scope: "INITIAL",
    locked: "Sin altura no hay IMC ni composición corporal",
  },
  {
    key: "perfil.objetivoPrincipal",
    label: "Objetivo principal",
    section: "Perfil",
    scope: "INITIAL",
    locked: "Se guarda como objetivo del socio",
  },
  { key: "perfil.objetivoSecundario", label: "Objetivo secundario", section: "Perfil", scope: "INITIAL" },
  { key: "perfil.motivacionReal", label: "Motivación real", section: "Perfil", scope: "INITIAL" },
  { key: "perfil.queLeHariaAbandonar", label: "Qué le haría abandonar", section: "Perfil", scope: "INITIAL" },

  { key: "experiencia.nivelActividad", label: "Nivel de actividad", section: "Experiencia", scope: "INITIAL" },
  { key: "experiencia.haEntrenadoAntes", label: "Ha entrenado antes", section: "Experiencia", scope: "INITIAL" },
  { key: "experiencia.anosExperiencia", label: "Años de experiencia", section: "Experiencia", scope: "INITIAL" },
  { key: "experiencia.tecnicaBasicos", label: "Técnica en básicos", section: "Experiencia", scope: "INITIAL" },
  { key: "experiencia.ejerciciosNoTolera", label: "Ejercicios que no tolera", section: "Experiencia", scope: "INITIAL" },

  {
    key: "screening",
    label: "Screening de salud completo",
    section: "Screening",
    scope: "INITIAL",
    locked: "Alimenta el Semáforo de Aptitud y el Session Brief",
  },

  { key: "seguimiento.adherenciaPercibida", label: "Adherencia percibida (1-5)", section: "Seguimiento", scope: "REVIEW" },
  { key: "seguimiento.progresoPercibido", label: "Progreso percibido (1-5)", section: "Seguimiento", scope: "REVIEW" },
  { key: "seguimiento.queHaMejorado", label: "Qué ha mejorado", section: "Seguimiento", scope: "REVIEW" },
  { key: "seguimiento.obstaculos", label: "Obstáculos", section: "Seguimiento", scope: "REVIEW" },
  { key: "seguimiento.objetivoProximoPeriodo", label: "Objetivo del próximo periodo", section: "Seguimiento", scope: "REVIEW" },

  { key: "marcas", label: "Marcas medibles", section: "Marcas", scope: "ALL" },

  { key: "cierre.notasEntrenador", label: "Notas del entrenador", section: "Cierre", scope: "ALL" },
  {
    key: "cierre.consentimientoParq",
    label: "PAR-Q y consentimiento de datos de salud",
    section: "Cierre",
    scope: "INITIAL",
    locked: "Sin firma no hay valoración (Art. 9 RGPD)",
  },
  { key: "cierre.autorizacionImagen", label: "Autorización de imagen", section: "Cierre", scope: "INITIAL" },
];

const QUESTION_BY_KEY = new Map(STANDARD_QUESTIONS.map((q) => [q.key, q]));

/** Preguntas que el centro puede apagar: las que no sostienen otro módulo. */
export function isTogglableQuestion(key: string): boolean {
  const question = QUESTION_BY_KEY.get(key);
  return !!question && !question.locked;
}

export function questionsForKind(kind: AssessmentKind): StandardQuestion[] {
  const scope: QuestionScope = kind === "INITIAL" ? "INITIAL" : "REVIEW";
  return STANDARD_QUESTIONS.filter((q) => q.scope === "ALL" || q.scope === scope);
}

// ---------- Preguntas propias del centro ----------

export type CustomQuestionDef = {
  key: string;
  label: string;
  type: AssessmentQuestionType;
  scope: QuestionScope;
  required: boolean;
  /**
   * Una pregunta retirada deja de hacerse pero no se borra: sus respuestas ya
   * guardadas siguen en `answers.custom` y la ficha las sigue enseñando con su
   * enunciado. Por eso la configuración las devuelve todas y es quien construye
   * el formulario quien se queda con las activas.
   */
  active: boolean;
};

export const CUSTOM_QUESTION_TYPE_LABEL: Record<AssessmentQuestionType, string> = {
  TEXT: "Texto libre",
  NUMBER: "Número",
  SCALE_1_5: "Escala 1-5",
};

export const CUSTOM_QUESTION_SCOPE_LABEL: Record<QuestionScope, string> = {
  ALL: "Todas las valoraciones",
  INITIAL: "Solo la inicial",
  REVIEW: "Solo las revisiones",
};

/** Preguntas propias que se hacen en una valoración de este tipo. */
export function customQuestionsForKind(kind: AssessmentKind, questions: CustomQuestionDef[]): CustomQuestionDef[] {
  const scope: QuestionScope = kind === "INITIAL" ? "INITIAL" : "REVIEW";
  return questions.filter((q) => q.active && (q.scope === "ALL" || q.scope === scope));
}

/**
 * Clave de una pregunta propia a partir de su enunciado. Se calcula una vez, al
 * crearla, y no vuelve a tocarse: es el nombre bajo el que quedan escritas las
 * respuestas en `answers.custom`, así que reescribir el enunciado no puede
 * moverlo o las valoraciones ya guardadas se quedarían sin respuesta.
 */
export function slugifyQuestionKey(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return base || "pregunta";
}

// ---------- Configuración completa ----------

export type AssessmentConfig = {
  milestones: AssessmentMilestoneDef[];
  /** Claves del catálogo estándar que este centro NO pregunta. */
  disabledQuestions: string[];
  customQuestions: CustomQuestionDef[];
};

/** Lo que se aplica a una organización que no ha configurado nada: F3 tal cual. */
export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
  milestones: STANDARD_MILESTONES,
  disabledQuestions: [],
  customQuestions: [],
};

/** Todas las preguntas estándar que se pueden apagar. */
export const ALL_TOGGLABLE_QUESTION_KEYS = STANDARD_QUESTIONS.filter((q) => !q.locked).map((q) => q.key);

/**
 * La misma configuración pero sin exigir ninguna respuesta, que es como se LEE
 * una valoración ya guardada: se contestó con la configuración de su día, y
 * reclamarle hoy una pregunta que se activó después la dejaría sin detalle en la
 * ficha (`parseAnswers` devuelve null cuando el cuestionario no valida).
 */
export function lenientConfig(config: AssessmentConfig): AssessmentConfig {
  return {
    ...config,
    disabledQuestions: ALL_TOGGLABLE_QUESTION_KEYS,
    customQuestions: config.customQuestions.map((q) => ({ ...q, required: false })),
  };
}

/** ¿Se hace esta pregunta estándar en esta organización? */
export function isQuestionEnabled(config: AssessmentConfig, key: string): boolean {
  if (!isTogglableQuestion(key)) return true;
  return !config.disabledQuestions.includes(key);
}
