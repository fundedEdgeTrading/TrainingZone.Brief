"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { getOrCreateConversation, sendMessage } from "@/lib/chat";

export type ChatActionResult = { ok: true } | { ok: false; error: string };

export async function sendMemberMessageAction(formData: FormData): Promise<ChatActionResult> {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) return { ok: false, error: "Socio no encontrado." };

  const conversation = await getOrCreateConversation(session.user.orgId, member.id);
  const result = await sendMessage(conversation.id, "MEMBER", session.user.id, String(formData.get("body") ?? ""));
  if (!result.ok) return result;
  // El chat vive en portal/layout.tsx, no en /portal/chat (solo un redirect a
  // /portal desde que el panel es flotante): revalidar esa ruta muerta no
  // refresca nada. Se revalida el layout, que es donde se lee la conversación.
  revalidatePath("/portal", "layout");
  return { ok: true };
}
