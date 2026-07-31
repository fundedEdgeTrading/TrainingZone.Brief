"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { purchasePlan } from "./actions";

export default function PurchasePlanButton({
  planId,
  children,
  className,
}: {
  planId: string;
  children: React.ReactNode;
  className: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleClick = () => {
    startTransition(async () => {
      const result = await purchasePlan(planId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Checkout de Stripe: navegación completa, no una ruta interna.
      window.location.href = result.url;
    });
  };

  return (
    <button type="button" onClick={handleClick} disabled={pending} className={className}>
      {pending ? "Redirigiendo…" : children}
    </button>
  );
}
