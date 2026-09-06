import { prisma } from "@/lib/prisma";

/**
 * E12-17 · traza de "se abrió WhatsApp", no el contenido de la conversación
 * (que ocurre fuera de la aplicación, en WhatsApp). Un solo punto de escritura
 * para los tres puntos de entrada (alerta de retención, recibo fallido, lead
 * sin responder).
 */
export async function logWhatsappContactOpened(input: {
  orgId: string;
  actorUserId: string;
  entityType: "Member" | "Lead" | "Payment";
  entityId: string;
  memberId?: string | null;
  reason: string;
}) {
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      actorUserId: input.actorUserId,
      action: "WHATSAPP_CONTACT_OPENED",
      entityType: input.entityType,
      entityId: input.entityId,
      memberId: input.memberId ?? null,
      metadata: { reason: input.reason },
    },
  });
}
