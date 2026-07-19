"use client";

import { useMemo, useState, useTransition } from "react";
import { registerManualPayment } from "./actions";

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
      className="bg-white border border-tz-linen rounded-xl p-4 grid grid-cols-1 md:grid-cols-5 gap-2 items-end"
    >
      <div className="md:col-span-2">
        <label className="block text-xs text-muted mb-1">Socio</label>
        <select
          name="memberId"
          required
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          className="w-full rounded-lg border border-tz-linen px-3 py-2 text-sm"
        >
          <option value="">Seleccionar...</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="subscriptionId" value={sub?.id ?? ""} />
      <div>
        <label className="block text-xs text-muted mb-1">Importe (€)</label>
        <input
          name="amount"
          type="number"
          step="0.01"
          required
          defaultValue={sub ? (sub.priceCents / 100).toFixed(2) : undefined}
          key={sub?.id ?? "none"}
          className="w-full rounded-lg border border-tz-linen px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">Método</label>
        <select name="method" className="w-full rounded-lg border border-tz-linen px-3 py-2 text-sm">
          <option value="CASH">Efectivo</option>
          <option value="CARD">Tarjeta</option>
          <option value="BIZUM">Bizum</option>
          <option value="TRANSFER">Transferencia</option>
          <option value="SEPA">Domiciliación</option>
        </select>
      </div>
      <button
        disabled={pending || !memberId}
        className="rounded-lg bg-tz-black text-white px-4 py-2 text-sm font-medium hover:bg-brand-ink-soft disabled:opacity-50"
      >
        {done ? "✓ Registrado" : pending ? "Guardando..." : "Registrar cobro"}
      </button>
    </form>
  );
}
