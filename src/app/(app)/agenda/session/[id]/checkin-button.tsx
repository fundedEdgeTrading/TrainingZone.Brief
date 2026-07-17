"use client";

import { useTransition } from "react";
import { toggleCheckIn } from "./actions";

export default function CheckinButton({
  bookingId,
  sessionId,
  checkedIn,
}: {
  bookingId: string;
  sessionId: string;
  checkedIn: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(() => toggleCheckIn(bookingId, sessionId))}
      className={`text-xs rounded-full px-3 py-1 font-medium transition ${
        checkedIn
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {checkedIn ? "✓ Check-in hecho" : "Marcar check-in"}
    </button>
  );
}
