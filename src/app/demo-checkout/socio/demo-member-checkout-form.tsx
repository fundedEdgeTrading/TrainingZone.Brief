"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { confirmDemoMemberCheckoutAction } from "./actions";

export default function DemoMemberCheckoutForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-critical">{error}</p>}
      <Button
        type="button"
        size="lg"
        disabled={pending}
        className="w-full"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await confirmDemoMemberCheckoutAction(token);
            if (result.ok) {
              // El destino es una ruta interna de la app (portal, recepción o
              // la confirmación pública del alta): navegación de Next, no un
              // recargado completo.
              router.replace(`${result.returnPath}?checkout=success`);
            } else {
              setError(result.error);
            }
          });
        }}
      >
        {pending && <ButtonSpinner />}
        {pending ? "Confirmando…" : "Confirmar (simulado)"}
      </Button>
    </div>
  );
}
