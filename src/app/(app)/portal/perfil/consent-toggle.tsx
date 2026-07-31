"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { updateMyConsentAction, type ConsentKind } from "./actions";

export function ConsentToggle({
  kind,
  label,
  description,
  granted,
  grantedAt,
}: {
  kind: ConsentKind;
  label: string;
  description: string;
  granted: boolean;
  grantedAt: Date | null;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      const result = await updateMyConsentAction(kind, !granted);
      if (result.ok) {
        toast.success(granted ? "Consentimiento retirado." : "Consentimiento otorgado.");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-t border-tz-sand first:border-0 first:pt-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${granted ? "bg-good" : "bg-brand-border"}`} />
          <span className="text-sm font-bold text-brand-text">{label}</span>
        </div>
        <p className="text-[12.5px] text-brand-muted mt-0.5">{description}</p>
        <p className="text-[11px] text-brand-muted-2 mt-1">
          {granted ? `Otorgado ${grantedAt ? grantedAt.toLocaleDateString("es-ES") : ""}` : "No otorgado"}
        </p>
      </div>
      <Button type="button" variant={granted ? "secondary" : "primary"} disabled={pending} onClick={toggle} className="shrink-0">
        {pending ? "..." : granted ? "Retirar" : "Otorgar"}
      </Button>
    </div>
  );
}
