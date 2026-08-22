import { prisma } from "@/lib/prisma";
import type { AssessmentKind } from "@prisma/client";
import { addMonthsClamped } from "@/lib/date-utils";
import { isInitialAnswers, schemaForKind, type AssessmentAnswers } from "./schemas";

/**
 * Hitos de revisión desde el alta (schema.prisma, enum AssessmentKind). El cron
 * de F4 crea la valoración que toca; aquí solo se ordenan para la ficha.
 */
export const ASSESSMENT_KIND_ORDER: AssessmentKind[] = ["INITIAL", "M1", "M3", "M6", "M9", "Y1"];

/** Meses desde el alta a los que vence cada hito. */
export const ASSESSMENT_KIND_MONTHS: Record<AssessmentKind, number> = {
  INITIAL: 0,
  M1: 1,
  M3: 3,
  M6: 6,
  M9: 9,
  Y1: 12,
};

// El recorte al último día del mes NO es opcional: con `setMonth` a secas, el
// hito de un mes de un alta el 31 de enero cae el 3 de marzo — otro mes — y la
// valoración de febrero no existe para nadie (F4 §5.2, cubierto por
// src/lib/date-utils.test.ts).
export function dueDateForKind(joinedAt: Date, kind: AssessmentKind): Date {
  return addMonthsClamped(joinedAt, ASSESSMENT_KIND_MONTHS[kind]);
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
export function parseAnswers(kind: AssessmentKind, answers: unknown): AssessmentAnswers | null {
  const parsed = schemaForKind(kind).safeParse(answers);
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
