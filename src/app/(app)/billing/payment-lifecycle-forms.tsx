"use client";

import { useState, useRef, useTransition } from "react";
import { postponePayment, refundPayments } from "./subscription-actions";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const CONTROL_SM =
  "rounded-md border border-brand-border bg-white px-2 py-1 text-xs text-brand-text focus:border-brand-ink focus:outline-none";

/** RB-PAGO-002: aplazar un pago pendiente (fecha límite futura + motivo obligatorio). */
export function PostponePaymentAction({ paymentId }: { paymentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-faint hover:text-tz-black transition-colors duration-150">
        Aplazar
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          const result = await postponePayment(fd);
          if (result.ok) {
            toast.success("Pago aplazado.");
            setOpen(false);
          } else toast.error(result.error);
        })
      }
      className="flex items-center gap-1"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="date" name="newDueDate" required className={CONTROL_SM} />
      <input type="text" name="reason" required placeholder="Motivo" className={`${CONTROL_SM} w-20`} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <ButtonSpinner />}
        OK
      </Button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-faint px-1">
        ✕
      </button>
    </form>
  );
}

/** RB-PAGO-003 (D-2): devolución en modo registro local — doble confirmación + motivo obligatorio. */
export function RefundPaymentAction({ paymentId }: { paymentId: string }) {
  const [step, setStep] = useState<"idle" | "form" | "confirm">("idle");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function submit() {
    startTransition(async () => {
      const fd = new FormData();
      fd.append("paymentId", paymentId);
      fd.append("reason", reason);
      const result = await refundPayments(fd);
      if (result.ok) {
        toast.success("Devolución registrada.");
        setStep("idle");
        setReason("");
      } else {
        toast.error(result.error);
        setStep("idle");
      }
    });
  }

  if (step === "idle") {
    return (
      <button onClick={() => setStep("form")} className="text-xs text-faint hover:text-critical transition-colors duration-150">
        Devolver
      </button>
    );
  }

  if (step === "form") {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motivo de la devolución"
          className={`${CONTROL_SM} w-28`}
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
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-critical">¿Confirmar devolución?</span>
      <Button type="button" size="sm" variant="danger" disabled={pending} onClick={submit}>
        {pending && <ButtonSpinner />}
        Sí, devolver
      </Button>
      <button type="button" onClick={() => setStep("idle")} className="text-xs text-faint px-1">
        Cancelar
      </button>
    </div>
  );
}
