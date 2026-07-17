"use client";

import { useTransition } from "react";
import { bookSession, cancelMyBooking } from "./actions";

export default function BookingButton({
  sessionId,
  myBookingId,
  myBookingStatus,
  canCancelFreely,
}: {
  sessionId: string;
  myBookingId: string | null;
  myBookingStatus: string | null;
  canCancelFreely: boolean;
}) {
  const [pending, startTransition] = useTransition();

  if (myBookingId) {
    return (
      <button
        disabled={pending}
        onClick={() => startTransition(() => cancelMyBooking(myBookingId))}
        className="text-xs rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 text-slate-600"
        title={canCancelFreely ? "" : "Fuera de la ventana de cancelación sin penalización (4h)"}
      >
        {myBookingStatus === "WAITLISTED" ? "Salir de lista de espera" : "Cancelar reserva"}
        {!canCancelFreely && " ⚠︎"}
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => bookSession(sessionId))}
      className="text-xs rounded-lg bg-indigo-600 text-white px-3 py-1.5 hover:bg-indigo-700"
    >
      Reservar
    </button>
  );
}
