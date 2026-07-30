"use client";

import { useTransition } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { purchasePlan } from "./actions";

export default function PurchasePlanButton({ planId }: { planId: string }) {
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
    <Button onClick={handleClick} disabled={pending} className="w-full">
      {pending && <ButtonSpinner />}
      {pending ? "Redirigiendo..." : "Comprar"}
    </Button>
  );
}
