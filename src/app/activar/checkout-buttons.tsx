"use client";

import { useState, useTransition } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import {
  createPlatformCheckoutAction,
  resendActivationLinkAction,
  resendVerificationEmailAction,
} from "./actions";
import type { PlatformPlan } from "@/lib/platform-plans";

export function PlanCheckoutButton({ plan }: { plan: PlatformPlan }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createPlatformCheckoutAction(plan.code);
            if (result.ok) {
              window.location.href = result.url;
            } else {
              setError(result.error);
            }
          })
        }
      >
        {pending && <ButtonSpinner />}
        {pending ? "Redirigiendo..." : `Activar ${plan.name} →`}
      </Button>
      {error && <p className="text-sm text-critical mt-2">{error}</p>}
    </div>
  );
}

export function ResendVerificationButton() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending || sent}
        className="text-sm font-medium underline text-brand-text disabled:opacity-60"
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await resendVerificationEmailAction();
            if (result.ok) setSent(true);
            else setError(result.error);
          })
        }
      >
        {sent ? "Email reenviado ✓" : pending ? "Enviando..." : "Reenviar email de confirmación"}
      </button>
      {error && <p className="text-sm text-critical mt-1">{error}</p>}
    </div>
  );
}

/**
 * RB-ALTA-002: reenvío del enlace de activación tras pagar. Quien acaba de pagar
 * no tiene contraseña todavía, así que este botón no exige sesión: se identifica
 * con la sesión de checkout de Stripe que trae en la URL.
 */
export function ResendActivationButton({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (sentTo) {
    return (
      <p className="text-sm text-brand-muted bg-tz-sand border border-brand-border rounded-control p-4">
        Enlace reenviado a <b>{sentTo}</b>.
      </p>
    );
  }

  return (
    <div>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await resendActivationLinkAction(sessionId);
            if (result.ok) setSentTo(result.email);
            else setError(result.error);
          })
        }
      >
        {pending && <ButtonSpinner />}
        {pending ? "Enviando..." : "Reenviarme el enlace de acceso"}
      </Button>
      {error && <p className="text-sm text-critical mt-2">{error}</p>}
    </div>
  );
}
