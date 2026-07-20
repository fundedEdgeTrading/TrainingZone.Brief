"use client";

import { useRef, useTransition } from "react";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendStaffMessageAction } from "./chat-actions";

const SENDER_LABEL: Record<string, string> = { MEMBER: "Cliente", TRAINER: "Entrenador", AI: "Asistente", DIRECTION: "Dirección" };

export function StaffChatThread({
  memberId,
  messages,
}: {
  memberId: string;
  messages: { id: string; senderKind: string; senderName: string | null; body: string; createdAt: Date }[];
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <div className="max-w-2xl border border-brand-border rounded-2xl flex flex-col h-[60vh]">
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {messages.length === 0 && <p className="text-sm text-brand-muted text-center mt-6">Sin mensajes todavía.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderKind === "MEMBER" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.senderKind === "MEMBER" ? "bg-tz-bone text-brand-text" : "bg-tz-black text-tz-bone"}`}>
              <p>{m.body}</p>
              <p className="text-[10px] mt-1 opacity-70">
                {m.senderName ?? SENDER_LABEL[m.senderKind] ?? m.senderKind} · {new Date(m.createdAt).toLocaleString("es-ES")}
              </p>
            </div>
          </div>
        ))}
      </div>
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            const result = await sendStaffMessageAction(memberId, fd);
            if (result.ok) formRef.current?.reset();
            else toast.error(result.error);
          })
        }
        className="flex gap-2 p-3 border-t border-tz-sand"
      >
        <Input name="body" placeholder="Responder al cliente..." className="flex-1" required />
        <Button type="submit" disabled={pending} size="sm">
          Enviar
        </Button>
      </form>
    </div>
  );
}
