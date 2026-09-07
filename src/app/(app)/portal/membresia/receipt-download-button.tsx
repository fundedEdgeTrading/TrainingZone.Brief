"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { getMemberReceiptUrl } from "./billing-actions";

export function ReceiptDownloadButton({ paymentId }: { paymentId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleClick = () => {
    startTransition(async () => {
      const result = await getMemberReceiptUrl(paymentId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.open(result.url, "_blank", "noopener,noreferrer");
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="text-xs font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink disabled:opacity-60 whitespace-nowrap"
    >
      {pending ? "Abriendo…" : "Descargar"}
    </button>
  );
}
