"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Field, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createStripeCheckoutAction } from "./actions";

export default function StripeCheckoutForm({
  members,
  plans,
  configured,
}: {
  members: { id: string; firstName: string; lastName: string }[];
  plans: { id: string; name: string }[];
  configured: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [memberId, setMemberId] = useState("");
  const [planId, setPlanId] = useState("");

  if (!configured) {
    return (
      <p className="text-sm text-brand-muted bg-tz-bone border border-brand-border rounded-lg p-4">
        Conecta tu Stripe para cobrar a tus socios online. Ve a <Link href="/organization" className="underline font-medium">Organización</Link> y pulsa &quot;Conectar cobros con Stripe&quot;. El cobro manual sigue disponible como puente mientras tanto.
      </p>
    );
  }

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await createStripeCheckoutAction(fd);
          if (result.ok) window.location.href = result.url;
          else toast.error(result.error);
        })
      }
      className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
    >
      <Field label="Socio">
        <Select name="memberId" required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Plan a cobrar">
        <Select name="planId" required value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending || !memberId || !planId}>
        {pending && <ButtonSpinner />}
        {pending ? "Creando checkout..." : "Cobrar con Stripe"}
      </Button>
    </form>
  );
}
