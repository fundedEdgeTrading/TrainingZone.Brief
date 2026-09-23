import type { InvitationType } from "@prisma/client";
import { db } from "./db";

/**
 * Token de la última invitación sin usar de ese email. Es el mismo enlace que
 * llevaría el email (que en este entorno no se envía), leído de `Invitation`
 * como hacen `alta-comercial.spec.ts` y `alta-completa-gimnasio.spec.ts`.
 *
 * Falla con nombre y apellidos si no existe: un `findFirst` que devuelve null
 * acabaría en un `/onboarding/undefined` y en un 404 que no dice nada.
 */
export async function pendingInvitationToken(orgId: string, email: string, type: InvitationType): Promise<string> {
  const invitation = await db().invitation.findFirst({
    where: { orgId, email: email.toLowerCase(), type, usedAt: null },
    orderBy: { createdAt: "desc" },
    select: { token: true },
  });
  if (!invitation) throw new Error(`No hay invitación ${type} pendiente para ${email} en la organización ${orgId}.`);
  return invitation.token;
}
