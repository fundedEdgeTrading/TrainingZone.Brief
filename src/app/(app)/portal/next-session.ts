import { isLiveBooking, type UpcomingBooking } from "@/lib/portal-queries";

/**
 * E5-04: "próxima sesión" de la home — la primera reserva viva de la lista ya
 * ordenada por `getMemberUpcomingBookings` (ascendente por `startsAt`), que
 * puede incluir reservas de clases que el centro ha anulado
 * (`sessionCancelled`): esas no cuentan como "tu próxima sesión".
 */
export function pickNextLiveBooking(bookings: UpcomingBooking[]): UpcomingBooking | null {
  return bookings.find(isLiveBooking) ?? null;
}
