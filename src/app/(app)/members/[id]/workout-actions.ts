"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { confirmWorkoutProgram, completeWorkoutProgram } from "@/lib/workout-programs";

export type WorkoutActionResult = { ok: true } | { ok: false; error: string };

export async function confirmWorkoutProgramAction(programId: string, memberId: string): Promise<WorkoutActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const result = await confirmWorkoutProgram(session.user.orgId, programId, session.user.id);
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function completeWorkoutProgramAction(programId: string, memberId: string): Promise<WorkoutActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const result = await completeWorkoutProgram(session.user.orgId, programId);
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}
