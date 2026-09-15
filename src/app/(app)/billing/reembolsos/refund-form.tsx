"use client";

import { useState, useTransition } from "react";
import { issueRefundAction, previewProrationAction } from "./actions";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const CONTROL =
  "rounded-md border border-brand-border bg-white px-2 py-1 text-xs text-brand-text focus:border-brand-ink focus:outline-none";

function euros(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/**
 * HU-ST-20 · Emitir una devolución sobre un cobro.
 *
 * Tres cosas que la historia exige y que están en el formulario, no solo en el
 * servidor:
 *
 *  · **El motivo es obligatorio.** El botón está deshabilitado hasta que hay
 *    uno. Un campo opcional que nadie rellena deja el AuditLog sin la mitad que
 *    lo hace útil, así que aquí no se puede continuar sin escribirlo.
 *  · **Doble confirmación.** Devolver dinero no tiene vuelta atrás.
 *  · **Doble clic.** Mientras la petición está en vuelo el botón queda
 *    deshabilitado; y si aun así entran dos, la clave de idempotencia del
 *    servidor hace que Stripe emita un solo refund. Esto es la comodidad; la
 *    garantía está en `stripe-idempotency.ts`.
 */
export function RefundForm({
  paymentId,
  maxRefundableCents,
  subscriptionId,
  isStripe,
}: {
  paymentId: string;
  maxRefundableCents: number;
  subscriptionId: string | null;
  isStripe: boolean;
}) {
  const [step, setStep] = useState<"idle" | "form" | "confirm">("idle");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const [prorating, startProration] = useTransition();
  const toast = useToast();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("paymentId", paymentId);
      fd.append("reason", reason);
      if (amount.trim()) fd.append("amount", amount.trim());

      const result = await issueRefundAction(fd);
      if (result.ok) {
        toast.success(
          result.via === "LOCAL"
            ? `Devolución registrada (${euros(result.refundedAmountCents)}). Cobro de caja: no ha pasado por Stripe.`
            : `Devolución emitida en Stripe (${euros(result.refundedAmountCents)}).`
        );
        setStep("idle");
        setReason("");
        setAmount("");
      } else {
        toast.error(result.error);
        setStep("idle");
      }
    });
  }

  function prorate() {
    if (!subscriptionId) return;
    startProration(async () => {
      const result = await previewProrationAction(subscriptionId);
      if (result.ok) {
        setAmount((result.amountCents / 100).toFixed(2));
        toast.success(`Prorrateo de Stripe: ${euros(result.amountCents)} por el tiempo no consumido.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("form")}
        className="text-xs text-faint hover:text-critical transition-colors duration-150"
      >
        Devolver
      </button>
    );
  }

  if (step === "form") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 justify-end">
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`${(maxRefundableCents / 100).toFixed(2)} €`}
          aria-label="Importe a devolver en euros (vacío = todo lo que queda)"
          className={`${CONTROL} w-20 text-right`}
        />
        {isStripe && subscriptionId && (
          <Button type="button" size="sm" variant="secondary" disabled={prorating} onClick={prorate}>
            {prorating && <ButtonSpinner />}
            Prorratear baja
          </Button>
        )}
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo (obligatorio)"
          aria-label="Motivo de la devolución"
          required
          className={`${CONTROL} w-40`}
        />
        <Button type="button" size="sm" variant="danger" disabled={!reason.trim()} onClick={() => setStep("confirm")}>
          Continuar
        </Button>
        <button type="button" onClick={() => setStep("idle")} className="text-xs text-faint px-1">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 justify-end">
      <span className="text-xs text-critical">
        ¿Devolver {amount.trim() ? euros(Math.round(Number(amount.replace(",", ".")) * 100)) : euros(maxRefundableCents)}?
      </span>
      <Button type="button" size="sm" variant="danger" disabled={pending} onClick={submit}>
        {pending && <ButtonSpinner />}
        Sí, devolver
      </Button>
      <button type="button" onClick={() => setStep("form")} className="text-xs text-faint px-1">
        Cancelar
      </button>
    </div>
  );
}
