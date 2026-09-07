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
  // falta, con motivo y decisión de devolución, o vuelve a estar simplemente
  // reservada — que es lo que hace desmarcar el check-in en la agenda y en la
  // app. `BOOKED` es la vuelta legítima y la única: desmarcar NUNCA cancela la
  // reserva (E2-02), porque cancelar devuelve bono y libera plaza.
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

/**
 * Lo mismo, incluido el propio destino: re-marcar lo que ya está marcado no
 * cambia nada y se acepta (`canBookingTransition` con `from === to`). Es la
 * lista exacta que va en el `where` del UPDATE condicional, así que la
 * comprobación previa y la carrera dicen siempre lo mismo.
 */
export function statusesEndingAt(to: BookingStatus): BookingStatus[] {
  return [to, ...statusesThatCanReach(to)];
}

export type BookingTransitionCheck = { ok: true } | { ok: false; error: string };

/**
 * `assertBookingTransition` contado como resultado, para los puntos de
 * escritura que atienden a una persona.
 *
 * El `bookingId` viaja desde el cliente (la agenda, el brief de la web y los
 * dos endpoints del entrenador en la app), así que una transición imposible no
 * siempre es un fallo de programación: puede ser una pantalla abierta desde
 * hace rato sobre una reserva que alguien acaba de cancelar. Eso se contesta
 * con un mensaje —409 en la API— y no con un 500.
 *
 * Es el único envoltorio: los CUATRO puntos de escritura entran por aquí. La
 * historia lo dice sin rodeos —cuatro parches separados vuelven a divergir— y
 * es justo lo que pasó (`markBookingNoShow` sí validaba el estado de partida;
 * las otras cuatro vías, ninguna).
 */
export function checkBookingTransition(from: BookingStatus, to: BookingStatus): BookingTransitionCheck {
  try {
    assertBookingTransition(from, to);
    return { ok: true };
  } catch (error) {
    if (error instanceof BookingTransitionError) return { ok: false, error: error.message };
    throw error;
  }
}
