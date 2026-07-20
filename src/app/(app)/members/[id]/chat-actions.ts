"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { canAccessMemberChat, getOrCreateConversation, sendMessage } from "@/lib/chat";

export type StaffChatActionResult = { ok: true } | { ok: false; error: string };

export async function sendStaffMessageAction(memberId: string, formData: FormData): Promise<StaffChatActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER"]);
  const allowed = await canAccessMemberChat(session.user.orgId, memberId, session.user.id, session.user.role);
  if (!allowed) return { ok: false, error: "No tienes acceso a este chat." };

  const conversation = await getOrCreateConversation(session.user.orgId, memberId);
  const senderKind = session.user.role === "TRAINER" ? "TRAINER" : "DIRECTION";
  const result = await sendMessage(conversation.id, senderKind, session.user.id, String(formData.get("body") ?? ""));
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}
