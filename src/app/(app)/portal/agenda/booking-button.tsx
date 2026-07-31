"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { bookSession, cancelMyBooking } from "./actions";
import { ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export default function BookingButton({
  sessionId,
  occurrenceDate,
  myBookingId,
  myBookingStatus,
  full,
  canCancelFreely,
  cancelWindowHours,
  variant = "card",
}: {
  sessionId: string;
  /** Día concreto de la serie ("YYYY-MM-DD"): una sesión recurrente comparte id entre ocurrencias. */
  occurrenceDate: string;
  myBookingId: string | null;
  myBookingStatus: string | null;
  full: boolean;
  canCancelFreely: boolean;
  /** RB-RES-005: horas de antelación configuradas, para explicar la penalización con el número real. */
  cancelWindowHours: number;
  /** "card": ocupa el ancho de la tarjeta. "row": botón compacto de una lista. */
  variant?: "card" | "row";
}) {
  const [pending, startTransition] = useTransition();
  // F6: cuando bookSession agota el bono (needsTopUp), el socio necesita un
  // camino visible a /portal/comprar en ese mismo momento — el toast solo
  // explica el motivo y desaparece a los pocos segundos sin salida ninguna.
  const [needsTopUp, setNeedsTopUp] = useState(false);
  // RB-RES-005: cancelar una reserva BOOKED fuera de la ventana de antelación
  // pierde la sesión del bono (no se devuelve). Se avisa con un modal antes de
  // confirmar — la lista de espera nunca tuvo coste, así que sale sin aviso.
  const [confirmingForfeit, setConfirmingForfeit] = useState(false);
  const toast = useToast();

  const baseClass = `${
    variant === "row" ? "shrink-0" : "flex-1"
  } min-h-[40px] text-center whitespace-nowrap rounded-[9px] px-4 py-[9px] font-display font-bold text-[13px] uppercase tracking-[.03em] transition-all duration-[180ms] disabled:opacity-60 inline-flex items-center justify-center gap-2 active:scale-[0.97]`;

  const handleCancel = (id: string) => {
    startTransition(async () => {
      const result = await cancelMyBooking(id);
      setConfirmingForfeit(false);
      if (result.ok) {
        toast.success(
          myBookingStatus === "WAITLISTED"
            ? "Has salido de la lista de espera."
            : result.forfeited
              ? "Reserva cancelada. Al ser fuera de plazo, la sesión queda como empleada y no se devuelve al bono."
              : "Reserva cancelada."
        );
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleCancelClick = (id: string) => {
    if (myBookingStatus === "BOOKED" && !canCancelFreely) {
      setConfirmingForfeit(true);
      return;
    }
    handleCancel(id);
  };

  const handleBook = () => {
    startTransition(async () => {
      const result = await bookSession(sessionId, occurrenceDate);
      if (result.ok) {
        setNeedsTopUp(false);
        toast.success(result.waitlisted ? "Te has unido a la lista de espera." : "¡Reserva confirmada!");
      } else {
        setNeedsTopUp(Boolean(result.needsTopUp));
        toast.error(result.error);
      }
    });
  };

  if (myBookingId) {
    // Sin promoción automática de lista de espera (decisión de negocio): si se
    // libera un hueco, quien esperaba ve el mismo "Reservar" que vería
    // cualquiera y lo reclama él mismo — nadie se lo confirma solo.
    const canClaimSpot = myBookingStatus === "WAITLISTED" && !full;
    if (canClaimSpot) {
      return (
        <div className={variant === "card" ? "flex-1 flex flex-col items-stretch gap-1.5" : "flex flex-col items-end gap-1.5"}>
          <button
            disabled={pending}
            onClick={handleBook}
            className={`${
              variant === "row" ? "shrink-0" : "w-full"
            } min-h-[40px] text-center whitespace-nowrap rounded-[9px] px-4 py-[9px] font-display font-bold text-[13px] uppercase tracking-[.03em] transition-all duration-[180ms] disabled:opacity-60 inline-flex items-center justify-center gap-2 active:scale-[0.97] bg-tz-black text-tz-bone border border-tz-black hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-10px_rgba(29,29,28,.35)]`}
          >
            {pending && <ButtonSpinner />}
            Se ha liberado un hueco · Reservar
          </button>
          <button
            disabled={pending}
            onClick={() => handleCancel(myBookingId)}
            className="text-[11px] font-semibold text-brand-muted underline underline-offset-2 hover:text-brand-text whitespace-nowrap"
          >
            Salir de la lista de espera
          </button>
        </div>
      );
    }

    const warnForfeit = myBookingStatus === "BOOKED" && !canCancelFreely;
    return (
      <>
        <button
          disabled={pending}
          onClick={() => handleCancelClick(myBookingId)}
          className={`${baseClass} bg-white text-brand-footer border border-[#d8d7cf] hover:bg-brand-ink hover:text-white hover:border-brand-ink`}
          title={warnForfeit ? `Fuera de la ventana de cancelación sin penalización (${cancelWindowHours}h)` : ""}
        >
          {pending && <ButtonSpinner />}
          {myBookingStatus === "WAITLISTED" ? "Salir de lista" : "Cancelar"}
          {warnForfeit && " ⚠︎"}
        </button>
        <ConfirmDialog
          open={confirmingForfeit}
          onCancel={() => setConfirmingForfeit(false)}
          onConfirm={() => handleCancel(myBookingId)}
          pending={pending}
          kicker="Cancelación fuera de plazo"
          title="Vas a perder esta sesión"
          description={
            <>
              Faltan menos de <b>{cancelWindowHours} horas</b> para esta clase. Si cancelas ahora, la sesión{" "}
              <b>no se devolverá a tu bono</b> y quedará como sesión empleada, igual que si hubieras asistido.
            </>
          }
          confirmLabel="Cancelar de todos modos"
          cancelLabel="Mantener mi reserva"
          pendingLabel="Cancelando..."
        />
      </>
    );
  }

  if (full) {
    return (
      <button
        disabled={pending}
        onClick={handleBook}
        className={`${baseClass} bg-brand-ink-soft text-white border border-brand-ink-soft hover:bg-brand-ink`}
      >
        {pending && <ButtonSpinner />}
        Unirme a lista
      </button>
    );
  }

  return (
    <div className={variant === "card" ? "flex-1 flex flex-col items-stretch gap-1.5" : "flex flex-col items-end gap-1.5"}>
      <button
        disabled={pending}
        onClick={handleBook}
        className={`${
          variant === "row" ? "shrink-0" : "w-full"
        } min-h-[40px] text-center whitespace-nowrap rounded-[9px] px-4 py-[9px] font-display font-bold text-[13px] uppercase tracking-[.03em] transition-all duration-[180ms] disabled:opacity-60 inline-flex items-center justify-center gap-2 active:scale-[0.97] bg-tz-black text-tz-bone border border-tz-black hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-10px_rgba(29,29,28,.35)]`}
      >
        {pending && <ButtonSpinner />}
        Reservar
      </button>
      {needsTopUp && (
        <Link
          href="/portal/comprar"
          className="text-[11px] font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink whitespace-nowrap"
        >
          Comprar bono →
        </Link>
      )}
    </div>
  );
}
