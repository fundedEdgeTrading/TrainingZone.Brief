"use server";

import { revalidatePath } from "next/cache";
import { requireRole, memberIsInScope, OUT_OF_CENTER_SCOPE } from "@/lib/guard";
import { canAccessMemberChat, getOrCreateConversation, sendMessage } from "@/lib/chat";

export type StaffChatActionResult = { ok: true } | { ok: false; error: string };

export async function sendStaffMessageAction(memberId: string, formData: FormData): Promise<StaffChatActionResult> {
  const session = await requireRole(["OWNER", "CENTER_DIRECTOR", "TRAINER", "TRAINER_ADMIN"]);
  const allowed = await canAccessMemberChat(session.user.orgId, memberId, session.user.id, session.user.role);
  if (!allowed) return { ok: false, error: "No tienes acceso a este chat." };
  if (!(await memberIsInScope(session.user, memberId))) return { ok: false, error: OUT_OF_CENTER_SCOPE };

  const conversation = await getOrCreateConversation(session.user.orgId, memberId);
  const senderKind =
    session.user.role === "TRAINER" || session.user.role === "TRAINER_ADMIN" ? "TRAINER" : "DIRECTION";
  const result = await sendMessage(conversation.id, senderKind, session.user.id, String(formData.get("body") ?? ""));
  if (!result.ok) return result;
  revalidatePath(`/members/${memberId}`);
  return { ok: true };
}
