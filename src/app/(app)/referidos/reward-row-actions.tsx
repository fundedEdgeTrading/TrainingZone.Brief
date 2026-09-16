"use client";

import { useState, useTransition } from "react";

import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { markRewardPaidAction, rejectRewardAction, validateRewardAction } from "./actions";

/**
 * Los dos saltos de estado de una recompensa, desde el listado.
 *
 * Lo que NO hay aquí, y no es un olvido: ningún botón toca un recibo, un
 * `Payment` ni un cupón de Stripe. "Validar" dice que el alta es buena;
 * "marcar pagada" deja constancia de que alguien ya aplicó el descuento o
 * cargó las sesiones. Las dos cosas las hace una persona en su sitio de
 * siempre — si el sistema lo hiciera solo, descuadraría Stripe.
 */
export function RewardRowActions({
  id,
  status,
  reviewRequired,
}: {
  id: string;
  status: "PENDING_VALIDATION" | "VALIDATED" | "PAID" | "REJECTED";
  reviewRequired: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const toast = useToast();

  function validate() {
    startTransition(async () => {
      const result = await validateRewardAction(id);
      if (result.ok) toast.success("Validada. Ahora toca aplicarla y marcarla como pagada.");
      else toast.error(result.error);
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectRewardAction(id, reason);
      if (result.ok) {
        toast.success("Rechazada, con su motivo.");
        setRejecting(false);
        setReason("");
      } else {
        toast.error(result.error);
      }
    });
  }

  function pay() {
    startTransition(async () => {
      const result = await markRewardPaidAction(id);
      if (result.ok) toast.success("Marcada como pagada.");
      else toast.error(result.error);
    });
  }

  if (status === "PAID" || status === "REJECTED") {
    return <span className="text-xs text-faint">—</span>;
  }

  if (rejecting) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <Input
          value={reason}
          autoFocus
          maxLength={200}
          aria-label="Motivo del rechazo"
          placeholder="Por qué no se paga"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reject();
            if (e.key === "Escape") setRejecting(false);
          }}
          className="h-8 py-1 text-xs w-52"
        />
        <button disabled={pending} onClick={reject} className="text-xs font-semibold text-brand-text-2 hover:opacity-80">
          Rechazar
        </button>
        <button
          disabled={pending}
          onClick={() => setRejecting(false)}
          className="text-xs text-faint hover:text-brand-text-2"
        >
          Cancelar
        </button>
      </div>
    );
  }

  if (status === "VALIDATED") {
    return (
      <div className="flex items-center gap-3 justify-end">
        <button
          disabled={pending}
          onClick={pay}
          className="text-xs font-semibold text-brand-text-2 hover:opacity-80"
          title="Deja constancia de que ya la habéis aplicado. El sistema no descuenta nada por su cuenta."
        >
          Marcar pagada
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 justify-end">
      <button
        disabled={pending}
        onClick={validate}
        className="text-xs font-semibold text-brand-text-2 hover:opacity-80"
        title={reviewRequired ? "Mírala antes: hay algo que el sistema no ha podido decidir solo." : undefined}
      >
        Validar
      </button>
      <button
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="text-xs text-faint hover:text-brand-text-2 transition-colors duration-150"
      >
        Rechazar
      </button>
    </div>
  );
}
