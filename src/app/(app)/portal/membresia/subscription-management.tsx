"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { openMemberBillingPortal, requestMemberCancellation, revertMemberCancellation } from "./subscription-actions";

function shortDate(date: Date) {
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * E5-01: "Gestionar mi pago" y "Darme de baja", el hueco que hoy obliga a
 * cerrar sesión e ir a la web pública. Un socio sin cliente de Stripe (su
 * centro cobra en efectivo/transferencia) no tiene nada que autogestionar
 * aquí: se le explica cómo tramitarlo con su centro, con el contacto a un clic.
 */
export function SubscriptionManagement({
  recurring,
  hasStripeCustomer,
  initialCancelAt,
  centerName,
  centerPhone,
}: {
  recurring: boolean;
  hasStripeCustomer: boolean;
  initialCancelAt: Date | null;
  centerName: string;
  centerPhone: string | null;
}) {
  const [pendingPortal, startPortal] = useTransition();
  const [pendingCancel, startCancel] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [cancelAt, setCancelAt] = useState<Date | null>(initialCancelAt);
  const toast = useToast();

  function openPortal() {
    startPortal(async () => {
      const result = await openMemberBillingPortal();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      window.location.href = result.url;
    });
  }

  function confirmCancel() {
    startCancel(async () => {
      const result = await requestMemberCancellation();
      if (!result.ok) {
        setConfirming(false);
        toast.error(result.error);
        return;
      }
      setCancelAt(result.cancelAt);
      setConfirming(false);
      toast.success("Baja programada.");
    });
  }

  function revert() {
    startCancel(async () => {
      const result = await revertMemberCancellation();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setCancelAt(null);
      toast.success("Baja revertida — sigues siendo socia.");
    });
  }

  return (
    <div
      id="suscripcion"
      className="bg-white border border-brand-border rounded-2xl p-[22px] tz-fade-up scroll-mt-24"
      style={{ animationDelay: "0.14s" }}
    >
      <div className="font-display font-extrabold text-base uppercase text-brand-text">Gestionar mi suscripción</div>

      {!hasStripeCustomer ? (
        <p className="text-sm text-brand-muted mt-3 leading-[1.6]">
          Tu centro todavía no cobra tu cuota online: para cambiar tu método de pago o darte de baja, habla
          directamente con {centerName}
          {centerPhone ? (
            <>
              {" "}
              ·{" "}
              <a href={`tel:${centerPhone}`} className="font-semibold text-brand-text underline underline-offset-2">
                {centerPhone}
              </a>
            </>
          ) : null}
          .
        </p>
      ) : (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openPortal}
            disabled={pendingPortal}
            className="border border-brand-border text-brand-text rounded-lg px-3.5 py-[9px] text-xs font-extrabold uppercase transition-colors duration-150 hover:bg-tz-bone disabled:opacity-60"
          >
            {pendingPortal ? "Abriendo…" : "Gestionar mi pago"}
          </button>

          {recurring &&
            (cancelAt ? (
              <>
                <span className="text-[13px] text-brand-muted">
                  Baja programada para el <b className="text-brand-text">{shortDate(cancelAt)}</b>
                </span>
                <button
                  type="button"
                  onClick={revert}
                  disabled={pendingCancel}
                  className="text-xs font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink disabled:opacity-60"
                >
                  {pendingCancel ? "Revirtiendo…" : "Revertir baja"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs font-semibold text-critical underline underline-offset-2 hover:text-critical/80"
              >
                Darme de baja
              </button>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={confirmCancel}
        pending={pendingCancel}
        kicker="Baja de tu cuota"
        title="Vas a darte de baja"
        description={
          <>
            Tu cuota no se cobrará más a partir del fin del periodo ya pagado. Hasta esa fecha conservas el acceso
            completo y las sesiones de tu bono siguen disponibles; después dejarás de ser socia activa. Puedes
            revertirlo en cualquier momento antes de esa fecha, desde esta misma pantalla.
          </>
        }
        confirmLabel="Confirmar baja"
        cancelLabel="Seguir siendo socia"
        pendingLabel="Procesando…"
      />
    </div>
  );
}
