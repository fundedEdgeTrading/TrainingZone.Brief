"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { submitTrainerDebrief, type FeedbackDimsInput } from "@/lib/feedback-capture";

export type TrainerFeedbackResult = { ok: true } | { ok: false; error: string };

export async function submitTrainerDebriefAction(
  memberId: string,
  input: FeedbackDimsInput & { note: string }
): Promise<TrainerFeedbackResult> {
  const session = await requireRole(["TRAINER", "OWNER", "CENTER_DIRECTOR"]);
  const result = await submitTrainerDebrief(session.user.orgId, session.user.id, memberId, input);
  if (!result.ok) return result;
  revalidatePath("/trainer");
  revalidatePath("/feedback");
  return { ok: true };
}
