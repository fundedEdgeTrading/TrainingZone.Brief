"use client";

import { useState, useTransition } from "react";
import { archiveCouponAction } from "./actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/**
 * HU-ST-27 · Retirar un código es ARCHIVARLO (invariante de Stripe del
 * trimestre: ni un `Price` ni un cupón se borran jamás). El texto del modal lo
 * dice explícitamente para que nadie lo lea como un borrado: las ventas que ya
 * lo usaron siguen contando en la medición.
 */
export function ArchiveCouponAction({ couponId, code }: { couponId: string; code: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-brand-text-2 border border-brand-border rounded-lg px-2.5 py-1 transition-colors hover:bg-brand-ink hover:text-white hover:border-brand-ink"
      >
        Archivar
      </button>
      <ConfirmDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await archiveCouponAction(couponId);
            if (result.ok) {
              setOpen(false);
              toast.success(`${code} ya no se puede canjear.`);
            } else {
              toast.error(result.error);
            }
          })
        }
        kicker="Archivar código"
        title={`¿Archivar ${code}?`}
        description="Deja de poder canjearse en el checkout, pero no se borra: las ventas que ya lo aplicaron siguen contando en la medición."
        confirmLabel="Archivar"
        pendingLabel="Archivando..."
        pending={pending}
      />
    </>
  );
}
