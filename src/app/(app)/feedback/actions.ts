"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

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

// No hay canal real de envío (push/email) en esta demo: la acción deja
// constancia en la bitácora de auditoría y confirma con un toast, igual que
// las demás acciones "ligeras" del board de Feedback.
export async function requestFeedbackAction(memberId: string): Promise<FeedbackActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!memberId) return { ok: false, error: "Socio no encontrado." };
  await logFeedbackAction(session.user.orgId, session.user.id, "FEEDBACK_REQUESTED", memberId);
  revalidatePath(`/feedback/${memberId}`);
  return { ok: true };
}

export async function markFeedbackReviewedAction(memberId: string): Promise<FeedbackActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!memberId) return { ok: false, error: "Socio no encontrado." };
  await logFeedbackAction(session.user.orgId, session.user.id, "FEEDBACK_REVIEWED", memberId);
  revalidatePath("/feedback");
  revalidatePath(`/feedback/${memberId}`);
  return { ok: true };
}

export async function scheduleFollowUpAction(memberId: string): Promise<FeedbackActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR"]);
  if (!memberId) return { ok: false, error: "Socio no encontrado." };
  await logFeedbackAction(session.user.orgId, session.user.id, "FEEDBACK_FOLLOWUP_SCHEDULED", memberId);
  revalidatePath(`/feedback/${memberId}`);
  return { ok: true };
}
