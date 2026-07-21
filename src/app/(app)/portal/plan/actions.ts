"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { requestWorkoutProgram, submitSelfAssessment } from "@/lib/workout-programs";
import { submitTrainerRating } from "@/lib/trainer-rating-access";

export type PortalPlanResult = { ok: true } | { ok: false; error: string };

async function currentMember() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return null;
  return { session, member };
}

export async function requestWorkoutProgramAction(): Promise<PortalPlanResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "Socio no encontrado." };
  const result = await requestWorkoutProgram(ctx.session.user.orgId, ctx.member.id);
  if (!result.ok) return result;
  revalidatePath("/portal/plan");
  return { ok: true };
}

export async function submitSelfAssessmentAction(formData: FormData): Promise<PortalPlanResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "Socio no encontrado." };
  const text = String(formData.get("text") ?? "");
  const stalled = formData.get("stalled") === "on";
  await submitSelfAssessment(ctx.session.user.orgId, ctx.member.id, {
    kind: "autovaloracion",
    text,
    structured: { stalled },
  });
  revalidatePath("/portal/plan");
  return { ok: true };
}

export async function submitTrainerRatingAction(formData: FormData): Promise<PortalPlanResult> {
  const ctx = await currentMember();
  if (!ctx) return { ok: false, error: "Socio no encontrado." };
  const scoreRaw = String(formData.get("score") ?? "");
  const result = await submitTrainerRating(ctx.session.user.orgId, ctx.session.user.id, {
    score: scoreRaw ? Number(scoreRaw) : undefined,
    strengths: String(formData.get("strengths") ?? ""),
    improvements: String(formData.get("improvements") ?? ""),
  });
  if (!result.ok) return result;
  revalidatePath("/portal/plan");
  return { ok: true };
}
