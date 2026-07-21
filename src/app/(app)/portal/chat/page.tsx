import { redirect } from "next/navigation";
import { requireRole } from "@/lib/guard";
import { getMemberForUser } from "@/lib/portal-queries";
import { getOrCreateConversation, listMessages } from "@/lib/chat";
import { ChatThread } from "./chat-thread";

export default async function PortalChatPage() {
  const session = await requireRole(["MEMBER"]);
  const member = await getMemberForUser(session.user.id);
  if (!member) redirect("/login");

  const conversation = await getOrCreateConversation(session.user.orgId, member.id);
  const messages = await listMessages(conversation.id);

  return (
    <div className="max-w-[700px] mx-auto">
      <ChatThread
        messages={messages.map((m) => ({ id: m.id, senderKind: m.senderKind, senderName: m.sender?.name ?? null, body: m.body, createdAt: m.createdAt }))}
        selfKind="MEMBER"
      />
    </div>
  );
}
