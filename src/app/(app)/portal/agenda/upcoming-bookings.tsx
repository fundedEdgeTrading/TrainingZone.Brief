import { sessionServiceKind } from "@/lib/members-queries";
import { isLiveBooking, type UpcomingBooking } from "@/lib/portal-queries";
import BookingButton from "./booking-button";

/**
 * "Tus próximas reservas": todas las reservas vivas del socio, también las que
 * caen fuera de los 7 días del listado de abajo o las que le agendó su
 * entrenador.
 */
export default function UpcomingBookings({
  bookings,
  cancelWindowHours,
}: {
  bookings: UpcomingBooking[];
  cancelWindowHours: number;
}) {
  if (bookings.length === 0) return null;

  const active = bookings.filter(isLiveBooking).length;

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
        <span className="inline-flex items-center rounded-full px-[11px] py-1.5 text-xs font-bold tabular-nums bg-good-bg text-good">
          {active} {active === 1 ? "reserva" : "reservas"}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-brand-border mt-1">
        {bookings.map((b) => {
          const isGroup = sessionServiceKind(b.classType) === "GROUP";
          return (
            <div key={b.bookingId} className="flex items-center justify-between gap-3 flex-wrap py-3.5">
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    b.sessionCancelled ? "bg-critical" : isGroup ? "bg-good" : "bg-brand-ink"
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
                      <span className="ml-2 inline-flex items-center rounded-full bg-critical-bg px-2 py-[3px] text-[11px] font-bold uppercase tracking-[.05em] text-critical align-middle">
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
                full={b.full}
                canCancelFreely={b.canCancelFreely}
                cancelWindowHours={cancelWindowHours}
                variant="row"
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
