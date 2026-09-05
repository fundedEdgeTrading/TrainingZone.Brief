"use server";

import { revalidatePath } from "next/cache";
import { requireRole, memberIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import { confirmWorkoutProgram, completeWorkoutProgram, getWorkoutProgramMemberId } from "@/lib/workout-programs";

export type WorkoutActionResult = { ok: true } | { ok: false; error: string };

export async function confirmWorkoutProgramAction(programId: string, memberId: string): Promise<WorkoutActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  // El ámbito se comprueba sobre el socio REAL del programa, no sobre el
  // `memberId` de la página abierta (que solo sirve para revalidar la ruta):
  // con un socio propio como coartada, se podía confirmar la rutina de un
  // socio de otro centro.
  const realMemberId = await getWorkoutProgramMemberId(session.user.orgId, programId);
  if (!realMemberId) return { ok: false, error: "Rutina no encontrada." };
  if (!(await memberIsInScope(session.user, realMemberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  const result = await confirmWorkoutProgram(session.user.orgId, programId, session.user.id);
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}

export async function completeWorkoutProgramAction(programId: string, memberId: string): Promise<WorkoutActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const realMemberId = await getWorkoutProgramMemberId(session.user.orgId, programId);
  if (!realMemberId) return { ok: false, error: "Rutina no encontrada." };
  if (!(await memberIsInScope(session.user, realMemberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };
  const result = await completeWorkoutProgram(session.user.orgId, programId);
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}
