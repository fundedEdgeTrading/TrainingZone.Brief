"use client";

import { useState, useTransition } from "react";
import { Field, Input } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { confirmDemoCheckoutAction } from "./actions";

export default function DemoCheckoutForm({ planCode }: { planCode: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      action={(formData: FormData) => {
        setError(null);
        startTransition(async () => {
          const result = await confirmDemoCheckoutAction(planCode, formData);
          if (result.ok) {
            window.location.href = result.activationUrl;
          } else {
            setError(result.error);
          }
        });
      }}
    >
      <Field label="Nombre del centro o de quien lo dirige">
        <Input name="name" required placeholder="Ej. Box Fenix" disabled={pending} />
      </Field>
      <Field label="Email" hint="Aquí llega tu enlace de activación">
        <Input name="email" type="email" required placeholder="tu@email.com" disabled={pending} />
      </Field>

      {error && <p className="text-sm text-critical">{error}</p>}

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <ButtonSpinner />}
        {pending ? "Pagando..." : "Pagar (simulado)"}
      </Button>
    </form>
  );
}
