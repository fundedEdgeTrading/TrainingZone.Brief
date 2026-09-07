"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/guard";
import { requestOwnTrainerRatings } from "@/lib/trainer-rating-access";

export type SubjectAccessActionResult = { ok: true; deadline: string } | { ok: false; error: string };

/**
 * E10-16 · El entrenador ejerce su derecho de acceso (art. 15 RGPD) sobre las
 * valoraciones que se han hecho de él.
 *
 * No lee nada aquí: la pantalla de valoraciones sigue siendo exclusiva de
 * dirección (RB-RRHH-011/012). Lo que hace esta acción es abrir la solicitud
 * con su plazo y dejarla registrada — que es lo que hoy no existía ni en papel.
 */
export async function requestOwnTrainerRatingsAction(): Promise<SubjectAccessActionResult> {
  const session = await requireRole(["TRAINER", "TRAINER_ADMIN"]);
  const result = await requestOwnTrainerRatings(session.user.orgId, session.user.id);
  if (!result.ok) return result;
  revalidatePath("/mi-perfil");
  return { ok: true, deadline: result.deadline.toISOString() };
}
