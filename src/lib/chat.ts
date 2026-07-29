import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

const CHAT_RECENT_WINDOW_DAYS = 90;

/**
 * RB-CHAT-001: visibilidad — dirección/recepción del centro ven el chat
 * completo. Un entrenador lo ve si ha impartido o dirigido alguna sesión de
 * ese socio (vía Booking) en la ventana reciente: ya no hay "el entrenador
 * asignado" fijo, el acceso se deriva de quién lo ha entrenado de verdad.
 */
export async function canAccessMemberChat(orgId: string, memberId: string, actorUserId: string, actorRole: Role) {
  if (actorRole === "OWNER" || actorRole === "CENTER_DIRECTOR" || actorRole === "RECEPTION") return true;
  if (actorRole !== "TRAINER") return false;

  const since = new Date(Date.now() - CHAT_RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentBooking = await prisma.booking.findFirst({
    where: {
      memberId,
      session: {
        orgId,
        date: { gte: since },
        OR: [{ trainerId: actorUserId }, { directedByUserId: actorUserId }],
      },
    },
    select: { id: true },
  });
  return !!recentBooking;
}

export async function getOrCreateConversation(orgId: string, memberId: string) {
  const existing = await prisma.conversation.findUnique({ where: { memberId } });
  if (existing) return existing;
  return prisma.conversation.create({ data: { orgId, memberId } });
}

export async function listMessages(conversationId: string) {
  return prisma.chatMessage.findMany({
    where: { conversationId },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export type ChatWriteResult = { ok: true } | { ok: false; error: string };

export async function sendMessage(
  conversationId: string,
  senderKind: "MEMBER" | "TRAINER" | "AI" | "DIRECTION",
  senderUserId: string | null,
  body: string
): Promise<ChatWriteResult> {
  if (!body.trim()) return { ok: false, error: "El mensaje no puede estar vacío." };
  await prisma.chatMessage.create({ data: { conversationId, senderKind, senderUserId, body: body.trim() } });
  return { ok: true };
}
