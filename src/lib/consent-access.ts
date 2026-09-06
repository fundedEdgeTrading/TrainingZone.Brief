import { prisma } from "@/lib/prisma";
import { CONSENT_FIELD, STAFF_REVOCABLE_CONSENTS, type ConsentKind } from "@/lib/consent";

export type RevokeConsentResult = { ok: true } | { ok: false; error: string };

/**
 * E12-12: retirar un consentimiento ACCESORIO (imágenes, marketing, IA) a
 * petición del socio, desde el panel de staff. La declaración de salud
 * queda fuera a propósito: es condición del servicio (E10-03) y su retirada
 * implica la baja, no un botón de este panel. Separado de la "use server"
 * action que lo llama para poder probarlo sin necesitar una sesión HTTP.
 */
export async function revokeMemberConsent(
  orgId: string,
  actorUserId: string,
  memberId: string,
  kind: ConsentKind
): Promise<RevokeConsentResult> {
  if (!STAFF_REVOCABLE_CONSENTS.includes(kind)) {
    return { ok: false, error: "Este consentimiento no se retira desde aquí." };
  }
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { id: true } });
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const fields = CONSENT_FIELD[kind];
  await prisma.member.update({
    where: { id: memberId },
    data: { [fields.flag]: false, [fields.at]: null },
  });

  await prisma.auditLog.create({
    data: {
      orgId,
      actorUserId,
      action: "CONSENT_REVOKED_BY_STAFF",
      entityType: "Member",
      entityId: memberId,
      memberId,
      metadata: { kind, requestedBy: "member" },
    },
  });

  return { ok: true };
}
