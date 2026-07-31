"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { submitClientFeedback, type FeedbackDimsInput } from "@/lib/feedback-capture";

export type PortalFeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitClientFeedbackAction(
  input: FeedbackDimsInput & { comment?: string }
): Promise<PortalFeedbackResult> {
  const session = await requireRole(["MEMBER"]);
  const result = await submitClientFeedback(session.user.orgId, session.user.id, input);
  if (!result.ok) return result;
  revalidatePath("/portal");
  return { ok: true };
}
