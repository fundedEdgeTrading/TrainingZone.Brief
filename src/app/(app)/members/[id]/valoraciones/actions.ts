"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { saveAssessment } from "@/lib/assessments/save";
import { dueDateForKind } from "@/lib/assessments/queries";
import { schemaForKind, type AssessmentAnswers } from "@/lib/assessments/schemas";
import type { AssessmentKind } from "@prisma/client";

// Rellenar valoraciones es trabajo de entrenador: es él quien firma el PAR-Q con
// el socio delante y quien interpreta el screening. Recepción queda fuera.
const ASSESSMENT_ROLES = ["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"] as const;

export type AssessmentActionResult = { ok: true; assessmentId: string } | { ok: false; error: string };

/**
 * Abre una valoración pendiente para un socio. El cron del aniversario (F4) crea
 * las suyas por su cuenta; esta es la vía manual del entrenador. Si ya hay una
 * del mismo hito sin completar se reutiliza en vez de duplicarla.
 */
export async function openAssessmentAction(memberId: string, kind: AssessmentKind): Promise<AssessmentActionResult> {
  const session = await requireRole([...ASSESSMENT_ROLES]);

  const member = await prisma.member.findFirst({
    where: { id: memberId, orgId: session.user.orgId },
    select: { id: true, joinedAt: true },
  });
  if (!member) return { ok: false, error: "No se ha encontrado ese socio." };

  const pending = await prisma.assessment.findFirst({
    where: { orgId: session.user.orgId, memberId, kind, completedAt: null },
    select: { id: true },
  });
  if (pending) return { ok: true, assessmentId: pending.id };

  const done = await prisma.assessment.findFirst({
    where: { orgId: session.user.orgId, memberId, kind, completedAt: { not: null } },
    select: { id: true },
  });
  if (done) return { ok: false, error: "Ese hito ya tiene una valoración completada." };

  const created = await prisma.assessment.create({
    data: {
      orgId: session.user.orgId,
      memberId,
      kind,
      dueDate: dueDateForKind(member.joinedAt, kind),
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
 */
export async function submitAssessmentAction(assessmentId: string, raw: unknown): Promise<AssessmentActionResult> {
  const session = await requireRole([...ASSESSMENT_ROLES]);

  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, orgId: session.user.orgId },
    select: { kind: true, memberId: true },
  });
  if (!assessment) return { ok: false, error: "No se ha encontrado esa valoración." };

  const parsed = schemaForKind(assessment.kind).safeParse(raw);
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
