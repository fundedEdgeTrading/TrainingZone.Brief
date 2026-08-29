"use server";

import { revalidatePath } from "next/cache";
import { requireRole, memberIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { saveAssessment } from "@/lib/assessments/save";
import { dueDateForMilestone, getAssessmentConfig, getAssessmentMilestones } from "@/lib/assessments/queries";
import { assessmentSchemaFor, type AssessmentAnswers } from "@/lib/assessments/schemas";
import { milestoneKeyOf } from "@/lib/assessments/config";

// Rellenar valoraciones es trabajo de entrenador: es él quien firma el PAR-Q con
// el socio delante y quien interpreta el screening. Recepción queda fuera.
const ASSESSMENT_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"] as const;

export type AssessmentActionResult = { ok: true; assessmentId: string } | { ok: false; error: string };

/**
 * Abre una valoración pendiente para un socio. El cron del aniversario (F4) crea
 * las suyas por su cuenta; esta es la vía manual del entrenador. Si ya hay una
 * del mismo hito sin completar se reutiliza en vez de duplicarla.
 *
 * El hito llega por su clave y no por el enum: los que ha añadido el centro
 * (F-VAL) no tienen valor de enum propio, se guardan como CUSTOM y se distinguen
 * por `milestoneKey`.
 */
export async function openAssessmentAction(
  memberId: string,
  milestoneKey: string
): Promise<AssessmentActionResult> {
  const session = await requireRole([...ASSESSMENT_ROLES]);

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, joinedAt: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };
  if (!(await memberIsInScope(session.user, member.id))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  const milestones = await getAssessmentMilestones(session.user.orgId);
  const milestone = milestones.find((m) => m.key === milestoneKey);
  if (!milestone) return { ok: false, error: "Ese hito ya no existe en la configuración del centro." };

  const existing = await prisma.assessment.findMany({
    where: { orgId: session.user.orgId, memberId },
    select: { id: true, kind: true, milestoneKey: true, completedAt: true },
  });
  const sameMilestone = existing.filter((a) => milestoneKeyOf(a) === milestone.key);

  const pending = sameMilestone.find((a) => !a.completedAt);
  if (pending) return { ok: true, assessmentId: pending.id };
  if (sameMilestone.length) return { ok: false, error: "Ese hito ya tiene una valoración completada." };

  const created = await prisma.assessment.create({
    data: {
      orgId: session.user.orgId,
      memberId,
      kind: milestone.kind,
      milestoneKey: milestone.standard ? null : milestone.key,
      dueDate: dueDateForMilestone(member.joinedAt, milestone),
      answers: {},
    },
    select: { id: true },
  });

  revalidatePath(`/members/${memberId}`);
  return { ok: true, assessmentId: created.id };
}

/**
 * Cierra una valoración. La validación real vive en los esquemas zod
 * (lib/assessments/schemas.ts) — incluido el PAR-Q, que es `literal(true)`: sin
 * firma no hay valoración guardada — y la propagación en lib/assessments/save.ts.
 *
 * El esquema se arma con la configuración de la organización: no reclama lo que
 * el centro ha apagado y sí valida, con su tipo, lo que haya añadido de su mano.
 */
export async function submitAssessmentAction(assessmentId: string, raw: unknown): Promise<AssessmentActionResult> {
  const session = await requireRole([...ASSESSMENT_ROLES]);

  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, orgId: session.user.orgId },
    select: { kind: true, memberId: true },
  });
  if (!assessment) return { ok: false, error: "No se ha encontrado esa valoración." };
  if (!(await memberIsInScope(session.user, assessment.memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  const config = await getAssessmentConfig(session.user.orgId);
  const parsed = assessmentSchemaFor(assessment.kind, config).safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? "Revisa los datos de la valoración." };
  }

  const result = await saveAssessment({
    assessmentId,
    orgId: session.user.orgId,
    actorUserId: session.user.id,
    actorRole: session.user.role,
    answers: parsed.data as AssessmentAnswers,
  });
  if (!result.ok) return result;

  revalidatePath(`/members/${assessment.memberId}`);
  revalidatePath(`/members/${assessment.memberId}/valoraciones`);
  return { ok: true, assessmentId };
}
