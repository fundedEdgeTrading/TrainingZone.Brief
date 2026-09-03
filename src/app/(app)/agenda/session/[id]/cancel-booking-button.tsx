"use client";

import { useTransition } from "react";
import { cancelSessionBookingAction } from "../../session-actions";
import { ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * Quitar a un socio del roster de la sesión. Antes esto se hacía de rebote al
 * guardar la sesión con el campo "Socio" vacío, lo que barría también las
 * reservas del resto y no devolvía el bono; ahora es una acción explícita, por
 * reserva, y reembolsa la sesión al bono (RB-RES-006).
 */
export default function CancelBookingButton({
  bookingId,
  sessionId,
  memberName,
  onCancelled,
}: {
  bookingId: string;
  sessionId: string;
  memberName: string;
  /** Aviso opcional tras cancelar, para quien mantiene su propia copia del roster (el diálogo de sesión). */
  onCancelled?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleClick() {
    startTransition(async () => {
      const result = await cancelSessionBookingAction(bookingId, sessionId);
      if (result.ok) {
        toast.success(`Reserva de ${memberName} cancelada.`);
        onCancelled?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <button
      disabled={pending}
      onClick={handleClick}
      aria-label={`Cancelar la reserva de ${memberName}`}
      className="inline-flex items-center gap-1.5 text-xs rounded-pill px-3 py-1 font-semibold text-critical transition-colors duration-150 hover:bg-critical-bg active:scale-95"
    >
      {pending && <ButtonSpinner />}
      Cancelar reserva
    </button>
  );
}
