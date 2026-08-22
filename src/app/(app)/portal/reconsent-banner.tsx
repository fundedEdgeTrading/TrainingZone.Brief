"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CONSENT_TEXT } from "@/lib/consent";
import { acceptCurrentConsentAction } from "./perfil/actions";

/**
 * Aviso de re-consentimiento (F3 §4.4). No bloquea el acceso al portal: el socio
 * puede cerrarlo y seguir. Oponerse a la IA es una de las dos respuestas
 * posibles, no una salida por la puerta de atrás.
 */
export function ReconsentBanner({ needed }: { needed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!needed || dismissed) return null;

  function accept(consentAI: boolean) {
    startTransition(async () => {
      const result = await acceptCurrentConsentAction(consentAI);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        consentAI ? "Consentimiento actualizado." : "Consentimiento actualizado sin tratamiento con IA."
      );
      router.refresh();
    });
  }

  return (
    <div className="max-w-[1120px] mx-auto bg-brand-card border border-brand-border rounded-[18px] p-5 sm:p-6 mb-[18px] tz-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex items-center gap-2 font-display font-bold text-[11px] tracking-[.16em] uppercase text-brand-text">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-apta-gold" />
          Hemos actualizado el texto de tus consentimientos
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-brand-muted hover:text-brand-text"
        >
          Ahora no
        </button>
      </div>
      <div className="text-[12.5px] text-brand-muted leading-relaxed mt-3 flex flex-col gap-2">
        {CONSENT_TEXT.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        <Button size="sm" disabled={pending} onClick={() => accept(true)}>
          {pending && <ButtonSpinner />}
          Acepto, incluido el tratamiento con IA
        </Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => accept(false)}>
          Acepto, pero me opongo a la IA
        </Button>
      </div>
    </div>
  );
}
