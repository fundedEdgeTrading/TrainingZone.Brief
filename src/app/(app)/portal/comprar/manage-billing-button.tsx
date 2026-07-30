"use client";

import { useTransition } from "react";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { manageMyBilling } from "./actions";

export default function ManageBillingButton() {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleClick = () => {
    startTransition(async () => {
      const result = await manageMyBilling();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.url;
    });
  };

  return (
    <Button variant="secondary" onClick={handleClick} disabled={pending}>
      {pending && <ButtonSpinner />}
      Gestionar mi suscripción
    </Button>
  );
}
