"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { markNoShowAction } from "./actions";
import { Button, ButtonSpinner } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { NO_SHOW_REASONS, NO_SHOW_REASON_HELP } from "@/lib/no-show";
import type { NoShowReason } from "@prisma/client";

/**
 * RB-RES-009: marcar "No asistió" ya no es un botón suelto. Pide siempre las
 * dos cosas que antes no se registraban: el motivo de la falta y si la sesión
 * vuelve al bono del cliente. Sin decisión no hay marcado —el diálogo no tiene
 * atajo—, porque el motivo alimenta la alerta a dirección por faltas seguidas y
 * la devolución mueve saldo.
 */
export default function NoShowButton({
  bookingId,
  sessionId,
  memberName,
  currentReason,
  refunded,
  hasSubscription,
}: {
  bookingId: string;
  sessionId: string;
  memberName: string;
  currentReason: NoShowReason | null;
  refunded: boolean;
  hasSubscription: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<NoShowReason>(currentReason ?? "FORGOT");
  // Por defecto NO se devuelve: es el comportamiento que tenía el sistema hasta
  // ahora, así que quien no se pare a decidir no regala saldo sin querer.
  const [refund, setRefund] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function confirm() {
    startTransition(async () => {
      const result = await markNoShowAction(bookingId, sessionId, reason, refund && hasSubscription);
      if (result.ok) {
        setOpen(false);
        toast.success(
          result.refunded
            ? `${memberName}: falta registrada y sesión devuelta al bono.`
            : `${memberName}: falta registrada, sin devolver la sesión.`
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  const isNoShow = currentReason != null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 text-xs rounded-pill px-3 py-1 font-semibold transition-colors duration-150 active:scale-95 " +
          (isNoShow ? "bg-critical-bg text-critical hover:opacity-80" : "bg-tz-sand text-text-2 hover:bg-tz-linen/40")
        }
        aria-label={`Marcar que ${memberName} no asistió`}
      >
        {isNoShow ? "✕ No asistió" : "No asistió"}
      </button>

      {open && (
        <NoShowDialog
          memberName={memberName}
          reason={reason}
          onReasonChange={setReason}
          refund={refund}
          onRefundChange={setRefund}
          hasSubscription={hasSubscription}
          alreadyRefunded={refunded}
          pending={pending}
          onCancel={() => !pending && setOpen(false)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}

function NoShowDialog({
  memberName,
  reason,
  onReasonChange,
  refund,
  onRefundChange,
  hasSubscription,
  alreadyRefunded,
  pending,
  onCancel,
  onConfirm,
}: {
  memberName: string;
  reason: NoShowReason;
  onReasonChange: (r: NoShowReason) => void;
  refund: boolean;
  onRefundChange: (v: boolean) => void;
  hasSubscription: boolean;
  alreadyRefunded: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Portal a body por lo mismo que ConfirmDialog: un ancestro con transform
  // crearía containing block y el position:fixed dejaría de cubrir la pantalla.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onCancel}
      className="fixed inset-0 z-[80] flex items-center justify-center p-5 bg-[rgba(20,20,18,.55)] backdrop-blur-[3px]"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Marcar falta de ${memberName}`}
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-full bg-white rounded-[18px] border border-brand-border shadow-pop overflow-hidden"
      >
        <div className="h-1 bg-critical" />
        <div className="px-6 pt-5 pb-5 space-y-4">
          <div>
            <div className="font-display font-bold text-[11px] uppercase tracking-[.08em] text-brand-muted">
              Falta de asistencia
            </div>
            <h2 className="font-display font-extrabold text-lg text-tz-black mt-1">{memberName} no asistió</h2>
          </div>

          <label className="block text-sm">
            <span className="text-text-2 font-semibold">Motivo</span>
            <Select
              value={reason}
              disabled={pending}
              onChange={(e) => onReasonChange(e.target.value as NoShowReason)}
              className="mt-1"
            >
              {NO_SHOW_REASONS.map((r) => (
                <option key={r} value={r}>
                  {NO_SHOW_REASON_HELP[r]}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              // Una falta ya devuelta se enseña marcada y bloqueada: el dato es
              // que la sesión volvió al bono, no que se pueda volver a devolver.
              checked={alreadyRefunded || (refund && hasSubscription)}
              disabled={pending || !hasSubscription || alreadyRefunded}
              onChange={(e) => onRefundChange(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Devolver la sesión al bono
              <span className="block text-xs text-muted">
                {alreadyRefunded
                  ? "Esta falta ya devolvió la sesión: no se vuelve a sumar."
                  : hasSubscription
                    ? "Suma una sesión al bono del que salió la reserva, igual que una cancelación a tiempo."
                    : "Esta reserva no descontó bono (cuota ilimitada o sesión sin cargo)."}
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="danger" size="sm" onClick={onConfirm} disabled={pending}>
              {pending && <ButtonSpinner />}
              Marcar falta
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
