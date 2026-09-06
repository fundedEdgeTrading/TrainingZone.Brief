import type { BookingStatus } from "@prisma/client";

/**
 * Máquina de estados de una reserva. Costura del trimestre: los CUATRO puntos
 * de escritura del estado de una reserva (agenda de staff, portal del socio,
 * descarte de asistente y captura de falta) pasan por aquí en vez de escribir
 * el estado a pelo, que es como se coló la transición que no debería existir.
 *
 * Lo que esto impide, y antes no impedía nada:
 *
 *  · `CANCELLED → ATTENDED`. Una reserva cancelada no la puede "asistir" nadie:
 *    la plaza se liberó, el bono se devolvió y marcarla como asistida cobraría
 *    la sesión dos veces (la devolución ya está hecha) y contaría una asistencia
 *    que no existió en el aforo ni en el panel.
 *  · `WAITLISTED → ATTENDED`. Quien está en lista de espera NO tiene plaza:
 *    saltar de la lista a "asistió" mete a alguien en una sesión llena sin
 *    pasar por la promoción, que es la que comprueba el aforo y descuenta bono.
 *
 * `CANCELLED` es terminal a propósito: volver a reservar crea una reserva
 * nueva, no resucita la anterior — el histórico de quién canceló y cuándo es
 * parte de la traza del bono.
 */
export const ALLOWED_BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  // Reserva viva: se cumple, se falta o se cancela.
  BOOKED: ["ATTENDED", "NO_SHOW", "CANCELLED"],
  // Lista de espera: solo se sale promocionando (que comprueba aforo y bono) o
  // saliéndose.
  WAITLISTED: ["BOOKED", "CANCELLED"],
  // Rectificación de una asistencia mal marcada (RB-RES-009): la sesión pasa a
  // falta, con motivo y decisión de devolución. También se puede desmarcar sin
  // más (un check-in puesto por error): vuelve a reservada, nunca a cancelada
  // (E2-03).
  ATTENDED: ["NO_SHOW", "BOOKED"],
  // Deshacer una falta (`clearBookingNoShow`): vuelve a asistida o a reservada.
  NO_SHOW: ["ATTENDED", "BOOKED"],
  CANCELLED: [],
};

export class BookingTransitionError extends Error {
  readonly from: BookingStatus;
  readonly to: BookingStatus;

  constructor(from: BookingStatus, to: BookingStatus) {
    super(bookingTransitionMessage(from, to));
    this.name = "BookingTransitionError";
    this.from = from;
    this.to = to;
  }
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  BOOKED: "reservada",
  WAITLISTED: "en lista de espera",
  ATTENDED: "asistida",
  NO_SHOW: "falta",
  CANCELLED: "cancelada",
};

/** Mensaje único: el mismo texto en la agenda, en el portal y en la app. */
export function bookingTransitionMessage(from: BookingStatus, to: BookingStatus): string {
  if (from === "CANCELLED") {
    return "Esa reserva está cancelada: para volver a ocupar la plaza hay que reservarla de nuevo.";
  }
  if (from === "WAITLISTED" && to === "ATTENDED") {
    return "Quien está en lista de espera no tiene plaza todavía: primero hay que darle la plaza.";
  }
  return `Una reserva ${STATUS_LABEL[from]} no puede pasar a ${STATUS_LABEL[to]}.`;
}

/** ¿Es legítimo este cambio de estado? Repetir el estado actual no cambia nada y se acepta. */
export function canBookingTransition(from: BookingStatus, to: BookingStatus): boolean {
  if (from === to) return true;
  return ALLOWED_BOOKING_TRANSITIONS[from].includes(to);
}

/**
 * Corta el cambio de estado ilegítimo. Lanza en vez de devolver un resultado
 * porque llegar aquí es un fallo de programación —la interfaz no ofrece esos
 * botones—, no una situación que el usuario deba resolver.
 */
export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canBookingTransition(from, to)) throw new BookingTransitionError(from, to);
}

/**
 * Variante para el `updateMany` condicional que ya usan los puntos de
 * escritura: los estados desde los que ESTE destino es alcanzable. Se pasa tal
 * cual a `where: { status: { in: … } }`, así la condición de carrera y la
 * máquina de estados dejan de ser dos listas que hay que acordarse de
 * mantener sincronizadas.
 */
export function statusesThatCanReach(to: BookingStatus): BookingStatus[] {
  const all = Object.keys(ALLOWED_BOOKING_TRANSITIONS) as BookingStatus[];
  return all.filter((from) => from !== to && ALLOWED_BOOKING_TRANSITIONS[from].includes(to));
}
