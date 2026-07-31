"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { requestFeedbackNow, markFeedbackReviewed, scheduleFeedbackFollowUp } from "@/lib/feedback-capture";

export type FeedbackActionResult = { ok: true } | { ok: false; error: string };

async function logFeedbackAction(orgId: string, actorUserId: string, action: string, memberId: string) {
  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action,
      entityType: "Member",
      entityId: memberId,
      memberId,
    },
  });
}

// Cada botón produce un efecto real (tarea de Notification, campo persistido
// en TrainerDebrief) además de la traza en AuditLog — antes solo escribían el
// AuditLog y no movían nada más.
export async function requestFeedbackAction(memberId: string): Promise<FeedbackActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!memberId) return { ok: false, error: "Socio no encontrado." };
  const result = await requestFeedbackNow(session.user.orgId, memberId);
  if (!result.ok) return result;
  await logFeedbackAction(session.user.orgId, session.user.id, "FEEDBACK_REQUESTED", memberId);
  revalidatePath(`/feedback/${memberId}`);
  return { ok: true };
}

export async function markFeedbackReviewedAction(memberId: string): Promise<FeedbackActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!memberId) return { ok: false, error: "Socio no encontrado." };
  const result = await markFeedbackReviewed(session.user.orgId, session.user.id, memberId);
  if (!result.ok) return result;
  await logFeedbackAction(session.user.orgId, session.user.id, "FEEDBACK_REVIEWED", memberId);
  revalidatePath("/feedback");
  revalidatePath(`/feedback/${memberId}`);
  return { ok: true };
}

export async function scheduleFollowUpAction(memberId: string): Promise<FeedbackActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!memberId) return { ok: false, error: "Socio no encontrado." };
  const result = await scheduleFeedbackFollowUp(session.user.orgId, memberId);
  if (!result.ok) return result;
  await logFeedbackAction(session.user.orgId, session.user.id, "FEEDBACK_FOLLOWUP_SCHEDULED", memberId);
  revalidatePath(`/feedback/${memberId}`);
  return { ok: true };
}
