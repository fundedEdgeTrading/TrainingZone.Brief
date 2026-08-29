"use client";

import { useState, useTransition } from "react";
import { bookSessionForMemberAction } from "../../session-actions";
import { Select } from "@/components/ui/field";
import { ButtonSpinner } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export type BookableMember = { id: string; firstName: string; lastName: string; waiting?: boolean };

/**
 * Reservar la plaza de un socio concreto en un grupo reducido desde el roster:
 * el reverso de "Cancelar reserva", para quien viene al mostrador o llama por
 * teléfono. Es una reserva PUNTUAL del día que se está mirando —no apunta a
 * nadie a las semanas siguientes— y descuenta su bono igual que si la hubiera
 * hecho el propio socio desde la app.
 *
 * Quien esté en lista de espera sigue apareciendo en el desplegable: elegirlo
 * es reclamar en su nombre la plaza liberada (RB-RES-007).
 */
export default function BookMemberForm({
  sessionId,
  occurrenceDate,
  members,
  full,
}: {
  sessionId: string;
  occurrenceDate: string;
  members: BookableMember[];
  full: boolean;
}) {
  const [memberId, setMemberId] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit() {
    if (!memberId) {
      toast.error("Elige un socio.");
      return;
    }
    const chosen = members.find((m) => m.id === memberId);
    startTransition(async () => {
      const result = await bookSessionForMemberAction(sessionId, memberId, occurrenceDate);
      if (result.ok) {
        toast.success(`Plaza reservada${chosen ? ` para ${chosen.firstName} ${chosen.lastName}` : ""}.`);
        setMemberId("");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (full) {
    return (
      <p className="text-xs text-muted">
        La sesión está completa: para dar una plaza, cancela antes una reserva. Quien quiera entrar puede apuntarse a la
        lista de espera desde su portal.
      </p>
    );
  }

  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div className="min-w-[16rem]">
        <Select
          value={memberId}
          searchable
          placeholder="Elige un socio"
          disabled={pending}
          onChange={(e) => setMemberId(e.target.value)}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.firstName} {m.lastName}
              {m.waiting ? " · en lista de espera" : ""}
            </option>
          ))}
        </Select>
      </div>
      <button
        onClick={handleSubmit}
        disabled={pending || !memberId}
        className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-control bg-tz-black text-white px-3.5 py-2 transition-colors duration-150 hover:bg-brand-ink-soft disabled:opacity-50"
      >
        {pending && <ButtonSpinner />}
        Reservar plaza
      </button>
    </div>
  );
}
