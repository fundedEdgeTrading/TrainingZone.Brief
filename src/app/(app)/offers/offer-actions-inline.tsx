"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { elevateOfferAction, decideOfferAction, markOfferCommunicatedAction } from "./actions";

export function OfferActions({ offerId, status, canApprove, canPropose }: { offerId: string; status: string; canApprove: boolean; canPropose: boolean }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) toast.error(result.error ?? "Error");
    });
  }

  if (status === "SUGERIDA" && canPropose) {
    return (
      <Button size="sm" disabled={pending} onClick={() => run(() => elevateOfferAction(offerId))}>
        Elevar a dirección
      </Button>
    );
  }
  if (status === "PENDIENTE_DIRECCION" && canApprove) {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => decideOfferAction(offerId, true))}>
          Aprobar
        </Button>
        <Button size="sm" variant="danger" disabled={pending} onClick={() => run(() => decideOfferAction(offerId, false))}>
          Rechazar
        </Button>
      </div>
    );
  }
  if (status === "APROBADA" && canPropose) {
    return (
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => markOfferCommunicatedAction(offerId))}>
        Marcar comunicada
      </Button>
    );
  }
  return null;
}
