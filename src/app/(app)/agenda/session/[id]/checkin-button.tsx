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
          ? "bg-good-bg text-good hover:opacity-80"
          : "bg-tz-sand text-text-2 hover:bg-tz-linen/40"
      }`}
    >
      {checkedIn ? "✓ Check-in hecho" : "Marcar check-in"}
    </button>
  );
}
