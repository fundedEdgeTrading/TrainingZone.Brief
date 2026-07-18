"use client";

import { useTransition } from "react";
import { bookSession, cancelMyBooking } from "./actions";

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

  const baseClass =
    "min-w-[150px] text-center whitespace-nowrap rounded-[9px] px-4 py-[9px] font-display font-bold text-[13px] uppercase tracking-[.03em] transition-all duration-[180ms] disabled:opacity-60";

  if (myBookingId) {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => cancelMyBooking(myBookingId))}
        className={`${baseClass} bg-white text-brand-footer border border-[#d8d7cf] hover:bg-brand-ink hover:text-white hover:border-brand-ink`}
        title={canCancelFreely ? "" : "Fuera de la ventana de cancelación sin penalización (4h)"}
      >
        {myBookingStatus === "WAITLISTED" ? "Salir de lista" : "Cancelar"}
        {!canCancelFreely && " ⚠︎"}
      </button>
    );
  }

  if (full) {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => bookSession(sessionId))}
        className={`${baseClass} bg-brand-ink-soft text-white border border-brand-ink-soft hover:bg-brand-ink`}
      >
        Unirme a lista
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => bookSession(sessionId))}
      className={`${baseClass} bg-brand-yellow text-brand-ink border border-brand-yellow hover:-translate-y-0.5 hover:shadow-[0_10px_22px_-10px_rgba(255,240,62,.7)]`}
    >
      Reservar
    </button>
  );
}
