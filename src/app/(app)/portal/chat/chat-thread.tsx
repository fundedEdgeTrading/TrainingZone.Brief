"use client";

import { useRef, useTransition } from "react";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { sendMemberMessageAction } from "./actions";

const SENDER_LABEL: Record<string, string> = { MEMBER: "Tú", TRAINER: "Tu entrenador", AI: "Asistente", DIRECTION: "Dirección" };

export function ChatThread({
  messages,
  selfKind,
}: {
  messages: { id: string; senderKind: string; senderName: string | null; body: string; createdAt: Date }[];
  selfKind: string;
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl flex flex-col h-[70vh]">
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.length === 0 && <p className="text-sm text-brand-muted text-center mt-8">Empieza la conversación con tu centro.</p>}
        {messages.map((m) => {
          const isSelf = m.senderKind === selfKind;
          return (
            <div key={m.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${isSelf ? "bg-tz-black text-tz-bone" : "bg-tz-bone text-brand-text"}`}>
                <p>{m.body}</p>
                <p className={`text-[10px] mt-1 ${isSelf ? "text-brand-muted-2" : "text-faint"}`}>
                  {m.senderName ?? SENDER_LABEL[m.senderKind] ?? m.senderKind} · {new Date(m.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <form
        ref={formRef}
        action={(fd) =>
          startTransition(async () => {
            const result = await sendMemberMessageAction(fd);
            if (result.ok) formRef.current?.reset();
            else toast.error(result.error);
          })
        }
        className="flex gap-2 p-4 border-t border-tz-sand"
      >
        <Input name="body" placeholder="Escribe un mensaje..." className="flex-1" required />
        <Button type="submit" disabled={pending}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
