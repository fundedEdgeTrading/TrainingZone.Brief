import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";

/** RB-CHAT-001: visibilidad — entrenador asignado + dirección ven el chat completo; el resto, no. */
export async function canAccessMemberChat(orgId: string, memberId: string, actorUserId: string, actorRole: Role) {
  if (actorRole === "OWNER" || actorRole === "CENTER_DIRECTOR") return true;
  if (actorRole !== "TRAINER") return false;
  const member = await prisma.member.findFirst({ where: { id: memberId, orgId }, select: { trainerId: true } });
  return member?.trainerId === actorUserId;
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
