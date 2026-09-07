import Link from "next/link";
import type { SessionBalance } from "@/lib/members-queries";
import type { UpcomingBooking } from "@/lib/portal-queries";
import BookingButton from "./agenda/booking-button";

/**
 * E5-04: las dos cosas que más se miran (saldo del bono y próxima hora) en la
 * primera pantalla del portal, cero toques — hoy el saldo vive en el sidebar,
 * que en móvil es un cajón detrás de la hamburguesa.
 */
export function BonoAndNextSession({
  balances,
  nextBooking,
  cancelWindowHours,
}: {
  balances: SessionBalance[];
  nextBooking: UpcomingBooking | null;
  cancelWindowHours: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 tz-fade-up" style={{ animationDelay: "0.02s" }}>
      <div className="bg-brand-card border border-brand-border rounded-2xl px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Tu bono</div>
        {balances.length === 0 ? (
          <div className="mt-2.5">
            <p className="text-sm text-brand-muted">Todavía no tienes ningún bono activo.</p>
            <Link
              href="/portal/membresia"
              className="inline-block mt-2 text-[13px] font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink"
            >
              Comprar un plan →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 mt-2.5">
            {balances.map((b) => (
              <div key={b.serviceKind} className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-brand-text">{b.serviceLabel}</span>
                {b.unlimited ? (
                  <span className="font-display font-extrabold text-xl tabular-nums text-good">∞</span>
                ) : (
                  <span
                    className={`font-display font-extrabold text-xl tabular-nums ${
                      (b.remaining ?? 0) <= 0 ? "text-critical" : (b.remaining ?? 0) <= 2 ? "text-warning" : "text-brand-text"
                    }`}
                  >
                    {b.remaining ?? 0}
                    {b.total != null && <span className="text-sm font-bold text-brand-muted-2"> / {b.total}</span>}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-brand-card border border-brand-border rounded-2xl px-5 py-4 flex flex-col justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand-muted">Próxima sesión</div>
          {nextBooking ? (
            <div className="mt-2.5">
              <div className="text-sm font-bold text-brand-text">{nextBooking.sessionName}</div>
              <div className="text-[13px] text-brand-muted mt-0.5">
                {nextBooking.dayLabel} · {nextBooking.startTime}
                {nextBooking.room ? ` · ${nextBooking.room}` : ""}
                {nextBooking.status === "WAITLISTED" ? " · Lista de espera" : ""}
              </div>
            </div>
          ) : (
            <div className="mt-2.5">
              <p className="text-sm text-brand-muted">No tienes ninguna reserva próxima.</p>
              <Link
                href="/portal/agenda"
                className="inline-block mt-2 text-[13px] font-semibold text-brand-text underline underline-offset-2 hover:text-brand-ink"
              >
                Reservar clase →
              </Link>
            </div>
          )}
        </div>
        {nextBooking && (
          <div className="mt-3 self-end">
            <BookingButton
              sessionId={nextBooking.sessionId}
              occurrenceDate={nextBooking.occurrenceDate}
              myBookingId={nextBooking.bookingId}
              myBookingStatus={nextBooking.status}
              full={nextBooking.full}
              canCancelFreely={nextBooking.canCancelFreely}
              cancelWindowHours={cancelWindowHours}
              variant="row"
            />
          </div>
        )}
      </div>
    </div>
  );
}
