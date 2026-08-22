"use client";

import { useState } from "react";
import type { BirthdayGreeting } from "@/lib/birthday-jobs";

/**
 * F5 §6.3: se ve una vez y solo una. El descarte se persiste en el servidor
 * (`resolvedAt` de la notificación) en vez de vivir en el estado del
 * componente, o volvería a saltar en cada navegación del portal.
 */
export function BirthdayGreetingScreen({ greeting }: { greeting: BirthdayGreeting }) {
  const [open, setOpen] = useState(true);

  async function dismiss() {
    setOpen(false);
    // Optimista: cerrar no puede quedarse esperando a la red. Si la petición
    // falla, la felicitación reaparece en la siguiente visita — no se pierde.
    await fetch("/api/portal/greeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: greeting.id }),
    }).catch(() => {});
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-5 bg-[rgba(20,20,18,.6)] backdrop-blur-[3px]"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Felicitación de cumpleaños"
        onClick={(e) => e.stopPropagation()}
        className="relative w-[440px] max-w-full bg-white rounded-[22px] overflow-hidden shadow-pop text-center [animation:tzPop_.4s_ease_both]"
      >
        <div className="bg-brand-ink px-7 pt-9 pb-8">
          <div className="text-[44px] leading-none">🎉</div>
          <div className="font-display font-extrabold text-[26px] text-tz-bone mt-3 tracking-[-.01em]">
            {greeting.title}
          </div>
        </div>
        <div className="px-7 py-7 flex flex-col gap-5">
          <p className="text-[15px] text-brand-text-2 leading-[1.6]">{greeting.body}</p>
          <button
            onClick={dismiss}
            className="w-full bg-brand-ink text-tz-bone rounded-[11px] px-7 py-[13px] font-display font-extrabold text-[13.5px] uppercase tracking-[.03em] hover:bg-brand-ink-soft transition-colors duration-150"
          >
            ¡Gracias!
          </button>
        </div>
      </div>
    </div>
  );
}
