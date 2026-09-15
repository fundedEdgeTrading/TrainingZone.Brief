"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/guard";
import { assignManualTag, removeManualTag, type TagActionResult } from "@/lib/tags-queries";

/**
 * Poner y quitar etiquetas MANUALES desde la ficha del socio (E14-23).
 *
 * El permiso es `canManageMembers` —el mismo que ya decide quién puede tocar la
 * ficha— y NO se ha añadido ninguno nuevo: `rbac.ts` está congelado este
 * trimestre. Quien pueda gestionar un socio puede etiquetarlo.
 *
 * El ámbito de centro y el rechazo de las automáticas los hace
 * `tags-queries.ts`, no esta capa: es la misma comprobación que usa `/etiquetas`
 * y no puede haber dos criterios.
 */
async function guard() {
  return requireRole(["OWNER", "CENTER_DIRECTOR", "RECEPTION"]);
}

export async function assignMemberTagAction(memberId: string, tagDefinitionId: string): Promise<TagActionResult> {
  const session = await guard();
  const result = await assignManualTag(session.user, memberId, tagDefinitionId);
  if (result.ok) {
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/members");
  }
  return result;
}

export async function removeMemberTagAction(memberId: string, tagDefinitionId: string): Promise<TagActionResult> {
  const session = await guard();
  const result = await removeManualTag(session.user, memberId, tagDefinitionId);
  if (result.ok) {
    revalidatePath(`/members/${memberId}`);
    revalidatePath("/members");
  }
  return result;
}
