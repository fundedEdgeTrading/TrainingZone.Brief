import { sessionServiceKind } from "@/lib/members-queries";
import { MAX_ACTIVE_BOOKINGS, countsTowardsActiveLimit, type UpcomingBooking } from "@/lib/portal-queries";
import BookingButton from "./booking-button";

/**
 * "Tus próximas reservas": todas las reservas vivas del socio, también las que
 * caen fuera de los 7 días del listado de abajo o las que le agendó su
 * entrenador. Es la contrapartida visible del tope de RB-RES-004 — antes el
 * socio podía tener 3 reservas contadas y ver solo una en pantalla.
 */
export default function UpcomingBookings({ bookings }: { bookings: UpcomingBooking[] }) {
  if (bookings.length === 0) return null;

  const active = bookings.filter(countsTowardsActiveLimit).length;
  const atLimit = active >= MAX_ACTIVE_BOOKINGS;

  return (
    <section
      aria-labelledby="upcoming-bookings-title"
      className="bg-brand-card border border-brand-border rounded-2xl px-5 py-[18px] tz-fade-up"
      style={{ animationDelay: "0.05s" }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2
          id="upcoming-bookings-title"
          className="font-display font-extrabold text-[13px] uppercase tracking-[.08em] text-brand-text"
        >
          Tus próximas reservas
        </h2>
        <span
          className={`inline-flex items-center rounded-full px-[11px] py-1.5 text-xs font-bold tabular-nums ${
            atLimit ? "bg-[#fdecea] text-critical" : "bg-[#eef0e4] text-[#4b5a22]"
          }`}
        >
          {active} de {MAX_ACTIVE_BOOKINGS} activas
        </span>
      </div>

      {atLimit && (
        <p className="text-[13px] text-brand-text-2 mt-2">
          Has llegado al máximo de reservas activas. Cancela una de estas para poder reservar otra clase.
        </p>
      )}

      <div className="flex flex-col divide-y divide-[#eeede6] mt-1">
        {bookings.map((b) => {
          const isGroup = sessionServiceKind(b.classType) === "GROUP";
          return (
            <div key={b.bookingId} className="flex items-center justify-between gap-3 flex-wrap py-3.5">
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    b.sessionCancelled ? "bg-critical" : isGroup ? "bg-[#4b5a22]" : "bg-brand-ink"
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-brand-text truncate">
                    {b.sessionName}
                    {b.status === "WAITLISTED" && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-tz-sand px-2 py-[3px] text-[11px] font-bold uppercase tracking-[.05em] text-brand-text-2 align-middle">
                        Lista de espera{b.waitlistPosition ? ` · nº ${b.waitlistPosition}` : ""}
                      </span>
                    )}
                    {b.sessionCancelled && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-[#fdecea] px-2 py-[3px] text-[11px] font-bold uppercase tracking-[.05em] text-critical align-middle">
                        Clase anulada por el centro
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-brand-muted mt-0.5">
                    {b.dayLabel} · {b.startTime}
                    {b.trainerName ? ` · ${b.trainerName}` : ""} · {b.centerName}
                  </div>
                </div>
              </div>
              <BookingButton
                sessionId={b.sessionId}
                occurrenceDate={b.occurrenceDate}
                myBookingId={b.bookingId}
                myBookingStatus={b.status}
                full={false}
                canCancelFreely={b.canCancelFreely}
                variant="row"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
