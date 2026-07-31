"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { requestWorkoutProgram } from "@/lib/workout-programs";

export type PortalEvolucionResult = { ok: true } | { ok: false; error: string };

export async function requestWorkoutProgramAction(): Promise<PortalEvolucionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "Socio no encontrado." };
  const result = await requestWorkoutProgram(session.user.orgId, member.id);
  if (!result.ok) return result;
  revalidatePath("/portal/evolucion");
  return { ok: true };
}
