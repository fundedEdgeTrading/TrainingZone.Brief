"use client";

import { useEffect, useState } from "react";
import { getSessionAttendeesAction, type SessionAttendeesResult } from "./session-actions";
import BookMemberForm from "./session/[id]/book-member-form";
import CancelBookingButton from "./session/[id]/cancel-booking-button";
import CheckinButton from "./session/[id]/checkin-button";

const STATUS_LABEL: Record<string, string> = {
  BOOKED: "Reservado",
  WAITLISTED: "Lista de espera",
  ATTENDED: "Asistió",
  NO_SHOW: "No-show",
};

/**
 * Pestaña "Asistentes" del diálogo de crear/editar sesión: roster de la
 * ocurrencia que se está mirando, con alta y baja de socios sin salir del
 * modal. Reutiliza las mismas acciones y componentes que la página de
 * detalle (`session/[id]/`) en vez de duplicar la lógica de reserva.
 *
 * Solo tiene sentido con la sesión ya guardada (hace falta un `sessionId`
 * real) y en grupo reducido: el EP se gestiona con el campo "Socio asignado".
 */
export default function SessionDialogAttendees({ sessionId, occurrenceDate }: { sessionId: string; occurrenceDate: string }) {
  // El resultado se guarda junto con los parámetros de la petición que lo
  // trajo: así una respuesta que llega tarde de una petición anterior (cambiar
  // de ocurrencia, o recargar tras una alta/baja) no pisa el estado actual con
  // datos viejos, sin tener que leer un ref durante el render.
  const [reloadKey, setReloadKey] = useState(0);
  const paramsKey = `${sessionId}:${occurrenceDate}:${reloadKey}`;
  const [loaded, setLoaded] = useState<{ paramsKey: string; result: SessionAttendeesResult } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSessionAttendeesAction(sessionId, occurrenceDate).then((res) => {
      if (!cancelled) setLoaded({ paramsKey, result: res });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, occurrenceDate, reloadKey, paramsKey]);

  const state = loaded?.paramsKey === paramsKey ? loaded.result : null;
  if (!state) {
    return <p className="text-sm text-muted py-4">Cargando asistentes…</p>;
  }
  if (!state.ok) {
    return <p className="text-sm text-critical py-4">{state.error}</p>;
  }

  const booked = state.attendees.filter((a) => a.status !== "WAITLISTED");
  const waitlisted = state.attendees.filter((a) => a.status === "WAITLISTED");
  const refresh = () => setReloadKey((k) => k + 1);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted">
            Asistentes ({booked.length}/{state.capacity})
          </div>
        </div>
        {booked.length === 0 ? (
          <p className="text-xs text-muted">Todavía no hay ningún socio apuntado a esta sesión.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {booked.map((a) => (
              <li
                key={a.bookingId}
                className="flex items-center justify-between gap-2 border border-brand-border rounded-control px-3 py-2"
              >
                <div className="text-sm text-brand-text">
                  {a.name}
                  <span className="block text-xs text-muted">{STATUS_LABEL[a.status]}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CheckinButton bookingId={a.bookingId} sessionId={sessionId} checkedIn={a.status === "ATTENDED"} onToggled={refresh} />
                  {a.status === "BOOKED" && (
                    <CancelBookingButton
                      bookingId={a.bookingId}
                      sessionId={sessionId}
                      memberName={a.name}
                      onCancelled={refresh}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {waitlisted.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">
            Lista de espera ({waitlisted.length})
          </div>
          <ul className="flex flex-col gap-1.5">
            {waitlisted.map((a) => (
              <li key={a.bookingId} className="text-sm text-text-2 px-1">
                {a.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.08em] text-muted mb-1.5">Añadir socio</div>
        {/* `key` fuerza a que el formulario reconsulte tras cada alta/baja: el
            listado de "quién puede entrar" cambia con el roster. */}
        <BookMemberForm
          sessionId={sessionId}
          occurrenceDate={occurrenceDate}
          members={state.bookableMembers}
          full={booked.length >= state.capacity}
          onBooked={refresh}
        />
      </div>
    </div>
  );
}
