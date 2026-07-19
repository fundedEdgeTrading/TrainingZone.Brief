"use client";

import { useMemo, useState, useTransition } from "react";
import { registerManualPayment } from "./actions";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonSpinner } from "@/components/ui/button";

type MemberOption = {
  id: string;
  firstName: string;
  lastName: string;
  subscriptions: { id: string; priceCents: number; plan: { name: string } }[];
};

export default function PaymentForm({ members }: { members: MemberOption[] }) {
  const [memberId, setMemberId] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  const selected = useMemo(() => members.find((m) => m.id === memberId), [memberId, members]);
  const sub = selected?.subscriptions[0];

  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await registerManualPayment(fd);
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        });
      }}
      className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
    >
      <Field label="Socio" className="md:col-span-2">
        <Select name="memberId" required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Seleccionar...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </Select>
      </Field>
      <input type="hidden" name="subscriptionId" value={sub?.id ?? ""} />
      <Field label="Importe (€)">
        <Input
          name="amount"
          type="number"
          step="0.01"
          required
          defaultValue={sub ? (sub.priceCents / 100).toFixed(2) : undefined}
          key={sub?.id ?? "none"}
        />
      </Field>
      <Field label="Método">
        <Select name="method">
          <option value="CASH">Efectivo</option>
          <option value="CARD">Tarjeta</option>
          <option value="BIZUM">Bizum</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="SEPA">Domiciliación</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending || !memberId}>
        {pending && <ButtonSpinner />}
        {done ? "✓ Registrado" : pending ? "Guardando..." : "Registrar cobro"}
      </Button>
    </form>
  );
}
