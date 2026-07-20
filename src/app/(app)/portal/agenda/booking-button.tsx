"use client";

import { useTransition } from "react";
import { bookSession, cancelMyBooking } from "./actions";
import { ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export default function BookingButton({
  sessionId,
  myBookingId,
  myBookingStatus,
  full,
  canCancelFreely,
}: {
  sessionId: string;
  myBookingId: string | null;
  myBookingStatus: string | null;
  full: boolean;
  canCancelFreely: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const baseClass =
    "min-w-[150px] min-h-[40px] text-center whitespace-nowrap rounded-[9px] px-4 py-[9px] font-display font-bold text-[13px] uppercase tracking-[.03em] transition-all duration-[180ms] disabled:opacity-60 inline-flex items-center justify-center gap-2 active:scale-[0.97]";

  const handleCancel = (id: string) => {
    startTransition(async () => {
      const result = await cancelMyBooking(id);
      if (result.ok) {
        toast.success(myBookingStatus === "WAITLISTED" ? "Has salido de la lista de espera." : "Reserva cancelada.");
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleBook = () => {
    startTransition(async () => {
      const result = await bookSession(sessionId);
      if (result.ok) {
        toast.success(result.waitlisted ? "Te has unido a la lista de espera." : "¡Reserva confirmada!");
      } else {
        toast.error(result.error);
      }
    });
  };

  if (myBookingId) {
    return (
      <button
        disabled={pending}
        onClick={() => handleCancel(myBookingId)}
        className={`${baseClass} bg-white text-brand-footer border border-[#d8d7cf] hover:bg-brand-ink hover:text-white hover:border-brand-ink`}
        title={canCancelFreely ? "" : "Fuera de la ventana de cancelación sin penalización (4h)"}
      >
        {pending && <ButtonSpinner />}
        {myBookingStatus === "WAITLISTED" ? "Salir de lista" : "Cancelar"}
        {!canCancelFreely && " ⚠︎"}
      </button>
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
    <button
      disabled={pending}
      onClick={handleBook}
      className={`${baseClass} bg-tz-black text-tz-bone border border-tz-black hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-10px_rgba(29,29,28,.35)]`}
    >
      {pending && <ButtonSpinner />}
      Reservar
    </button>
  );
}
