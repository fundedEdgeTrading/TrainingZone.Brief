import type { BookingStatus } from "@prisma/client";

/**
 * RB-AGENDA-010: qué hay que deshacer antes de borrar una sesión de la agenda.
 *
 * Hasta ahora `deleteSession` (agenda-queries.ts) borraba debriefs, reservas y
 * sesión con tres `deleteMany` sueltos: el socio perdía la plaza, **el bono no
 * volvía** y no quedaba ni una línea de `AuditLog` — a diferencia de
 * `discardAttendeeAsStaff`, que audita cada descarte. Borrar una clase entera
 * era, literalmente, quedarse con la sesión de todos los apuntados, y el
 * descuadre solo aparecía semanas después al cuadrar el bono.
 *
 * Aquí vive solo la DECISIÓN, sin `prisma`: qué reservas devuelven bono, a
 * quién hay que avisar y cuántas asistencias ya registradas obligan a
 * confirmar. Mismo patrón que `attendee-discard.ts` — la regla se prueba sin
 * base de datos y no depende del reloj del runner.
 */

/** Motivo con el que se audita cada devolución provocada por el borrado. */
export const SESSION_DELETED_AUDIT_ACTION = "SESSION_DELETED";

export type UnwindableBooking = {
  id: string;
  memberId: string;
  status: BookingStatus;
  /** Bono del que salió la reserva. `null` = no consumió (espera, ilimitado). */
  subscriptionId: string | null;
};

export type SessionDeletionPlan<T extends UnwindableBooking> = {
  /**
   * Reservas que consumieron bono y siguen vivas: una sesión de vuelta cada
   * una, con su entrada de `AuditLog`.
   */
  refunds: T[];
  /**
   * Reservas vivas (con plaza o en espera) cuyo socio tiene que enterarse de
   * que la clase no se da. Incluye a quien esperaba: se quedó sin la clase
   * igual, aunque no haya bono que devolver.
   */
  notify: T[];
  /**
   * Asistencias y faltas ya registradas. No devuelven nada —la sesión se
   * consumió de verdad— pero borrarlas destruye histórico, así que obligan a
   * confirmar explícitamente.
   */
  settled: T[];
};

/**
 * Reparte las reservas de la sesión según lo que hay que deshacer:
 *
 * - `BOOKED` con bono → se devuelve la sesión. Es el caso verificado por
 *   reproducción (bono a 5 → reserva de staff → 4 → borrado → tiene que
 *   volver a 5).
 * - `BOOKED` sin bono → no hay nada que devolver (cuota ilimitada, o franja de
 *   EP agendada a mano sin cargo), pero al socio se le avisa igual.
 * - `WAITLISTED` → nunca descontó: no se devuelve nada y no rompe nada.
 * - `CANCELLED` → el bono ya volvió al cancelar, y la reserva se quedó sin
 *   `subscriptionId`: devolver aquí sería la segunda devolución de la misma
 *   sesión.
 * - `ATTENDED` / `NO_SHOW` → la sesión se consumió (o la falta ya decidió su
 *   devolución en `markBookingNoShow`): no se devuelve, y su presencia es lo
 *   que obliga a confirmar el borrado.
 */
export function planSessionDeletion<T extends UnwindableBooking>(bookings: T[]): SessionDeletionPlan<T> {
  const refunds: T[] = [];
  const notify: T[] = [];
  const settled: T[] = [];

  for (const booking of bookings) {
    if (booking.status === "BOOKED" || booking.status === "WAITLISTED") {
      notify.push(booking);
      // La lista de espera no consumió bono aunque llevara `subscriptionId`
      // (no debería), así que la condición es el estado Y el bono.
      if (booking.status === "BOOKED" && booking.subscriptionId) refunds.push(booking);
      continue;
    }
    if (booking.status === "ATTENDED" || booking.status === "NO_SHOW") settled.push(booking);
  }

  return { refunds, notify, settled };
}

/**
 * Texto de la confirmación que se pide antes de borrar una sesión con
 * asistencias registradas. Vive junto a la regla para que el número que ve
 * quien confirma salga del mismo sitio que la decisión.
 */
export function describeSettledAttendance(count: number): string {
  const what = count === 1 ? "una asistencia ya registrada" : `${count} asistencias ya registradas`;
  return `Esta sesión tiene ${what}. Borrarla elimina ese histórico y no devuelve esas sesiones al bono.`;
}
