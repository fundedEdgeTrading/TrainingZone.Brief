"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { claimLeadAction } from "./actions";

export function ClaimLeadButton({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await claimLeadAction(leadId);
          if (result.ok) toast.success("Lead reclamado");
          else toast.error(result.error);
        })
      }
    >
      Reclamar
    </Button>
  );
}
