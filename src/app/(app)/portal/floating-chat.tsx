"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { sendMemberMessageAction } from "./chat/actions";

const SELF_KIND = "MEMBER";

const SENDER_LABEL: Record<string, string> = {
  MEMBER: "Tú",
  TRAINER: "Tu entrenador",
  AI: "Asistente",
  DIRECTION: "Dirección",
};

// Chips de respuesta rápida: envían un mensaje enlatado como si lo escribiera el socio.
const QUICK_REPLIES: { label: string; text: string }[] = [
  { label: "Reservar una clase", text: "Quiero reservar una clase." },
  { label: "Mi próxima sesión", text: "¿Cuándo es mi próxima sesión?" },
  { label: "Hablar con recepción", text: "Necesito hablar con recepción." },
];

export type FloatingChatMessage = {
  id: string;
  senderKind: string;
  senderName: string | null;
  body: string;
  createdAt: Date | string;
};

// Eco optimista del socio mientras el server persiste el mensaje real.
type PendingMessage = { id: string; body: string };

function timeLabel(createdAt: Date | string) {
  return new Date(createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export function FloatingChat({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: FloatingChatMessage[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [isSending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tempCounter = useRef(0);

  const serverLast = initialMessages.at(-1);
  const serverLastId = serverLast?.id ?? null;

  // El hilo canónico vive en el server. Cuando router.refresh() trae mensajes
  // nuevos (con el mensaje ya persistido y las respuestas del entrenador/IA),
  // el último id cambia y descartamos los ecos optimistas ya reflejados.
  // Ajustar estado durante el render (patrón recomendado por React) evita el
  // efecto de sincronización y sus renders en cascada.
  const [ackId, setAckId] = useState(serverLastId);
  if (ackId !== serverLastId) {
    setAckId(serverLastId);
    if (pending.length) setPending([]);
  }

  // Marca de "último mensaje ajeno visto" para el punto de no leídos. Arranca
  // sin nada visto: si el último mensaje del hilo es ajeno (bienvenida de la IA,
  // respuesta del entrenador…), el launcher muestra el punto hasta que se abre.
  const [seenId, setSeenId] = useState<string | null>(null);
  const lastFromOther = !!serverLast && serverLast.senderKind !== SELF_KIND;
  const unread = !open && lastFromOther && serverLastId !== seenId;

  const memberHasWritten = pending.length > 0 || initialMessages.some((m) => m.senderKind === SELF_KIND);

  function openPanel() {
    setOpen(true);
    setSeenId(serverLastId);
  }

  // Enfocar el input al abrir.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Auto-scroll al final al abrir y al añadirse mensajes.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [open, initialMessages.length, pending.length]);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function send(body: string) {
    const text = body.trim();
    if (!text) return;

    const tempId = `temp-${(tempCounter.current += 1)}`;
    setPending((prev) => [...prev, { id: tempId, body: text }]);

    const fd = new FormData();
    fd.set("body", text);
    startTransition(async () => {
      const result = await sendMemberMessageAction(fd);
      if (result.ok) {
        router.refresh();
      } else {
        setPending((prev) => prev.filter((m) => m.id !== tempId));
        toast.error(result.error);
      }
    });
  }

  return (
    <div data-conversation-id={conversationId}>
      {/* Panel emergente */}
      <div
        data-open={open}
        aria-hidden={!open}
        className="fixed right-7 bottom-[104px] w-[372px] max-w-[calc(100vw-40px)] z-[60] origin-bottom-right transition-[opacity,transform] duration-200 ease-out-soft data-[open=false]:opacity-0 data-[open=false]:translate-y-4 data-[open=false]:scale-[.97] data-[open=false]:pointer-events-none data-[open=true]:opacity-100 data-[open=true]:translate-y-0 data-[open=true]:scale-100 data-[open=true]:duration-[250ms]"
      >
        <div className="bg-brand-card border border-brand-border rounded-[20px] overflow-hidden shadow-pop flex flex-col h-[500px] max-h-[calc(100vh-150px)]">
          {/* Header */}
          <div className="bg-brand-ink p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand-ink-soft flex items-center justify-center shrink-0">
              <span className="inline-flex items-baseline font-display font-bold text-[17px] text-tz-bone">
                A
                <span className="w-1 h-1 ml-0.5 rounded-full bg-gradient-to-br from-[#e3cfa2] to-[#b58e52]" />
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-sm text-white">Asistente Training Zone</div>
              <div className="flex items-center gap-1.5 text-xs text-brand-muted-2 mt-px">
                <span className="w-[7px] h-[7px] rounded-full bg-[#6f8a3a]" />
                En línea · responde al instante
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
              className="w-[30px] h-[30px] rounded-lg bg-white/[.08] text-tz-bone flex items-center justify-center text-base leading-none transition-colors hover:bg-white/[.18]"
            >
              ✕
            </button>
          </div>

          {/* Mensajes */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-2.5 bg-[#faf8f3]">
            {initialMessages.map((m) => {
              const isSelf = m.senderKind === SELF_KIND;
              return (
                <div key={m.id} className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`tz-bubble-in max-w-[80%] rounded-2xl px-[13px] py-2.5 text-[13.5px] leading-[1.45] ${
                      isSelf ? "bg-tz-black text-tz-bone" : "bg-white text-brand-text border border-[#eee5d6]"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p className={`text-[10px] mt-1 ${isSelf ? "text-brand-muted-2" : "text-faint"}`}>
                      {m.senderName ?? SENDER_LABEL[m.senderKind] ?? m.senderKind} · {timeLabel(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            {pending.map((m) => (
              <div key={m.id} className="flex justify-end">
                <div className="tz-bubble-in max-w-[80%] rounded-2xl px-[13px] py-2.5 text-[13.5px] leading-[1.45] bg-tz-black text-tz-bone opacity-80">
                  <p>{m.body}</p>
                  <p className="text-[10px] mt-1 text-brand-muted-2">{SENDER_LABEL.MEMBER} · enviando…</p>
                </div>
              </div>
            ))}
          </div>

          {/* Respuestas rápidas (se ocultan al iniciar la conversación) */}
          {!memberHasWritten && (
            <div className="flex flex-wrap gap-1.5 px-[18px] pb-3 bg-[#faf8f3]">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => send(q.text)}
                  disabled={isSending}
                  className="text-xs font-semibold text-brand-text-2 bg-white border border-brand-border rounded-full px-3 py-1.5 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink disabled:opacity-50"
                >
                  {q.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const el = inputRef.current;
              if (!el) return;
              send(el.value);
              el.value = "";
            }}
            className="flex gap-2 p-3.5 border-t border-[#eeede6] bg-white"
          >
            <input
              ref={inputRef}
              name="body"
              placeholder="Escribe un mensaje..."
              className="flex-1 min-w-0 border border-brand-border rounded-[10px] px-3 py-2.5 text-sm bg-[#faf8f3] text-brand-text placeholder:text-faint outline-none focus:border-brand-ink"
            />
            <button
              type="submit"
              disabled={isSending}
              className="bg-brand-ink text-tz-bone rounded-[10px] px-4 font-display font-bold text-[13px] transition-opacity disabled:opacity-50"
            >
              Enviar
            </button>
          </form>
        </div>
      </div>

      {/* Botón flotante (launcher) */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-label={open ? "Cerrar chat" : "Abrir chat"}
        aria-expanded={open}
        className="fixed right-7 bottom-7 w-[60px] h-[60px] rounded-full bg-brand-ink border-none cursor-pointer z-[61] flex items-center justify-center shadow-[0_14px_34px_-10px_rgba(29,29,28,.55)] transition-transform duration-200 hover:scale-[1.06]"
      >
        {open ? (
          <span className="text-tz-bone text-[22px] leading-none">✕</span>
        ) : (
          <span className="relative flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f4f0e8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8 8.38 8.38 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z" />
            </svg>
            {unread && (
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-critical border-2 border-brand-ink" />
            )}
          </span>
        )}
      </button>
    </div>
  );
}
