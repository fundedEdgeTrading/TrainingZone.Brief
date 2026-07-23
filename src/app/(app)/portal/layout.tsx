import { requireSession } from "@/lib/session";
import { getMemberForUser } from "@/lib/portal-queries";
import { getOrCreateConversation, listMessages } from "@/lib/chat";
import { FloatingChat } from "./floating-chat";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  // El chat flotante es exclusivo del socio. Para el resto de roles (que solo
  // llegarían aquí por URL directa) montamos el portal sin el launcher.
  let floatingChat = null;
  if (session.user.role === "MEMBER") {
    const member = await getMemberForUser(session.user.id);
    if (member) {
      const conversation = await getOrCreateConversation(session.user.orgId, member.id);
      const messages = await listMessages(conversation.id);
      floatingChat = (
        <FloatingChat
          conversationId={conversation.id}
          initialMessages={messages.map((m) => ({
            id: m.id,
            senderKind: m.senderKind,
            senderName: m.sender?.name ?? null,
            body: m.body,
            createdAt: m.createdAt,
          }))}
        />
      );
    }
  }

  return (
    <>
      {children}
      {floatingChat}
    </>
  );
}
