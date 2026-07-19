"use client";

import { useTransition } from "react";
import clsx from "clsx";
import { toggleCheckIn } from "./actions";
import { ButtonSpinner } from "@/components/ui/button";

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
      className={clsx(
        "inline-flex items-center gap-1.5 text-xs rounded-pill px-3 py-1 font-semibold transition-colors duration-150 active:scale-95",
        checkedIn ? "bg-good-bg text-good hover:opacity-80" : "bg-tz-sand text-text-2 hover:bg-tz-linen/40"
      )}
    >
      {pending && <ButtonSpinner />}
      {checkedIn ? "✓ Check-in hecho" : "Marcar check-in"}
    </button>
  );
}
