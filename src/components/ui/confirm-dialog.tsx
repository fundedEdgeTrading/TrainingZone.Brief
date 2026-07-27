"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button, ButtonSpinner } from "@/components/ui/button";

const noopSubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * Confirmación modal para acciones destructivas (borrado). Se renderiza en un
 * portal a document.body por el mismo motivo que el Drawer: un ancestro con
 * transform crearía un containing block y rompería el position:fixed.
 *
 * Cuando la acción está bloqueada por una regla de negocio se pasa
 * `blockedReason`: el modal explica el motivo y no ofrece el botón de confirmar.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  kicker,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  pendingLabel,
  pending = false,
  blockedReason,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  kicker: string;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  pending?: boolean;
  blockedReason?: string | null;
}) {
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, pending, onCancel]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      onClick={() => !pending && onCancel()}
      className="fixed inset-0 z-[80] flex items-center justify-center p-5 bg-[rgba(20,20,18,.55)] backdrop-blur-[3px]"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-[480px] max-w-full bg-white rounded-[18px] border border-brand-border shadow-pop overflow-hidden [animation:tzDangerIn_.5s_var(--ease-out-soft)_both]"
      >
        {/* Filete superior: marca el modal como acción destructiva. */}
        <div className="h-1 bg-critical" />
        <div className="px-6 sm:px-7 pt-6 pb-5">
          <div className="w-[38px] h-[38px] rounded-full bg-critical-bg text-critical flex items-center justify-center mb-3 [animation:tzPop_.45s_var(--ease-spring)_.1s_both]">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
            </svg>
          </div>
          <div className="font-display font-bold text-[11px] tracking-[.16em] uppercase text-critical">{kicker}</div>
          <h2 className="font-display font-extrabold text-xl uppercase tracking-[-.01em] text-brand-text mt-1">
            {title}
          </h2>
          <div className="text-sm text-brand-text-2 leading-[1.55] mt-3">{description}</div>
          {blockedReason && (
            <p className="text-sm text-critical bg-tz-bone border border-tz-linen rounded-lg p-3 mt-4">{blockedReason}</p>
          )}
        </div>
        <div className="flex gap-2.5 justify-end px-6 sm:px-7 py-4 border-t border-tz-sand bg-tz-bone/40">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            {blockedReason ? "Entendido" : cancelLabel}
          </Button>
          {!blockedReason && (
            <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>
              {pending && <ButtonSpinner />}
              {pending ? (pendingLabel ?? "Eliminando...") : confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
