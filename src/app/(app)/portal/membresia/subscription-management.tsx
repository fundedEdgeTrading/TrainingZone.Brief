"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { openMemberBillingPortal, requestMemberCancellation, revertMemberCancellation } from "./subscription-actions";
import type { ReasonOption } from "@/lib/member-lifecycle";

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
  cancelReasons,
  planLabel,
  children,
}: {
  recurring: boolean;
  hasStripeCustomer: boolean;
  initialCancelAt: Date | null;
  centerName: string;
  centerPhone: string | null;
  /**
   * Producto sobre el que actúan estos botones, cuando el socio tiene más de
   * uno. La baja y la congelación se aplican a UN bono —el último dado de
   * alta—, así que con dos bonos hay que decir a cuál, o el socio cree que da
   * de baja toda su membresía.
   */
  planLabel?: string | null;
  /** E14-15: catálogo `CancelReason` de la organización. El motivo es obligatorio. */
  cancelReasons: ReasonOption[];
  /** E5-06: bloque de congelación, montado por el caller — se mantiene fuera de este componente para no acoplarlo a Stripe/RB-PAGO-004. */
  children?: React.ReactNode;
}) {
  const [pendingPortal, startPortal] = useTransition();
  const [pendingCancel, startCancel] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [cancelReasonId, setCancelReasonId] = useState("");
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
      const result = await requestMemberCancellation(cancelReasonId);
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
      {planLabel ? (
        <p className="text-[13px] text-brand-muted mt-1.5">
          Estas acciones afectan a <b className="text-brand-text">{planLabel}</b>. Para cualquier otro de tus productos,
          habla con {centerName}
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
      ) : null}

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
            {/* E14-15 · El motivo es obligatorio: es lo único que distingue a quien se
                va por precio de quien se muda, y de eso depende la campaña de vuelta. */}
            <label className="mt-3.5 flex flex-col gap-1 text-[11px] font-bold uppercase tracking-[.06em] text-brand-muted">
              ¿Por qué te vas?
              <select
                value={cancelReasonId}
                onChange={(e) => setCancelReasonId(e.target.value)}
                className="border border-brand-border rounded-lg px-2.5 py-2 text-sm text-brand-text normal-case font-medium"
              >
                <option value="">Elige un motivo…</option>
                {cancelReasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
        confirmDisabled={!cancelReasonId}
        confirmLabel="Confirmar baja"
        cancelLabel="Seguir siendo socia"
        pendingLabel="Procesando…"
      />

      {children}
    </div>
  );
}
