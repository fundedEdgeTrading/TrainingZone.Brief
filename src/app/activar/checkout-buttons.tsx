"use client";

import { useState, useTransition } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { createPlatformCheckoutAction, resendVerificationEmailAction } from "./actions";
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
