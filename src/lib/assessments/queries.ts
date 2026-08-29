import { prisma } from "@/lib/prisma";
import type { AssessmentKind } from "@prisma/client";
import { addMonthsClamped } from "@/lib/date-utils";
import { isInitialAnswers, assessmentSchemaFor, type AssessmentAnswers } from "./schemas";
import {
  DEFAULT_ASSESSMENT_CONFIG,
  STANDARD_MILESTONES,
  dueDateForMilestone,
  isTogglableQuestion,
  lenientConfig,
  resolveMilestones,
  type AssessmentConfig,
  type AssessmentMilestoneDef,
} from "./config";

/**
 * Configuración de valoraciones de una organización (hitos, preguntas apagadas y
 * preguntas propias).
 *
 * Sin filas devuelve exactamente el estándar de F3, así que una organización que
 * nunca haya abierto la pantalla de configuración se comporta como siempre. Las
 * preguntas bloqueadas se ignoran aunque alguien haya escrito su fila a mano:
 * el catálogo manda sobre la base de datos, no al revés.
 */
export async function getAssessmentConfig(orgId: string): Promise<AssessmentConfig> {
  const [milestones, toggles, custom] = await Promise.all([
    prisma.assessmentMilestone.findMany({
      where: { orgId },
      select: { key: true, label: true, months: true },
    }),
    prisma.assessmentQuestionToggle.findMany({ where: { orgId }, select: { questionKey: true } }),
    prisma.assessmentCustomQuestion.findMany({
      where: { orgId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { key: true, label: true, type: true, scope: true, required: true, active: true },
    }),
  ]);

  return {
    milestones: resolveMilestones(milestones),
    disabledQuestions: toggles.map((t) => t.questionKey).filter(isTogglableQuestion),
    customQuestions: custom,
  };
}

export { dueDateForMilestone };

/** Hitos de una organización, ya ordenados por vencimiento. */
export async function getAssessmentMilestones(orgId: string): Promise<AssessmentMilestoneDef[]> {
  const rows = await prisma.assessmentMilestone.findMany({
    where: { orgId },
    select: { key: true, label: true, months: true },
  });
  return resolveMilestones(rows);
}

/**
 * Vencimiento de un hito estándar con la periodicidad por defecto. Solo para
 * quien no tiene la configuración a mano y trabaja con la valoración inicial,
 * que vence el mismo día del alta en cualquier configuración razonable.
 */
export function dueDateForKind(joinedAt: Date, kind: AssessmentKind): Date {
  const milestone = STANDARD_MILESTONES.find((m) => m.kind === kind);
  return addMonthsClamped(joinedAt, milestone?.months ?? 0);
}

export async function listAssessmentsForMember(orgId: string, memberId: string) {
  return prisma.assessment.findMany({
    where: { orgId, memberId },
    orderBy: [{ dueDate: "asc" }],
    include: { filledBy: { select: { name: true } } },
  });
}

export async function getAssessment(orgId: string, assessmentId: string) {
  return prisma.assessment.findFirst({
    where: { id: assessmentId, orgId },
    include: {
      filledBy: { select: { name: true } },
      member: { select: { id: true, firstName: true, lastName: true, consentHealth: true } },
    },
  });
}

/**
 * `answers` es Json y el formulario evoluciona, así que las valoraciones viejas
 * pueden no encajar en el esquema de hoy. Se devuelve null en vez de reventar la
 * ficha del socio: la valoración se sigue listando, solo que sin detalle.
 */
export function parseAnswers(
  kind: AssessmentKind,
  answers: unknown,
  config: AssessmentConfig = DEFAULT_ASSESSMENT_CONFIG
): AssessmentAnswers | null {
  // Al LEER no se exige lo que hoy esté activado: una valoración cerrada hace
  // seis meses se contestó con la configuración de entonces, y volver a pedirle
  // una pregunta que se activó después la dejaría sin detalle en la ficha.
  const parsed = assessmentSchemaFor(kind, lenientConfig(config)).safeParse(answers);
  return parsed.success ? (parsed.data as AssessmentAnswers) : null;
}

/**
 * Serie de constantes valoración a valoración: es lo que se grafica y la razón
 * de que `vitalsSchema` sea común a la inicial y a las revisiones.
 */
export function vitalsSeries(
  assessments: { kind: AssessmentKind; completedAt: Date | null; answers: unknown }[]
) {
  return assessments
    .filter((a) => a.completedAt)
    .map((a) => {
      const answers = parseAnswers(a.kind, a.answers);
      if (!answers) return null;
      return {
        date: a.completedAt!,
        kind: a.kind,
        pesoKg: answers.pesoKg,
        dolorActual: answers.dolorActual,
        calidadSueno: answers.calidadSueno,
        estres: answers.estres,
        energia: answers.energia,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Zonas de dolor declaradas en la valoración inicial más reciente. */
export function declaredPainZones(kind: AssessmentKind, answers: AssessmentAnswers): string[] {
  return isInitialAnswers(kind, answers) ? answers.screening.zonasDolor : [];
}
