/**
 * Descarte de un asistente por parte del entrenador (rediseño de la app móvil).
 *
 * Es una regla DISTINTA de la cancelación del propio socio, y por eso vive en
 * su propio módulo en vez de colarse como un parámetro más de
 * `CANCEL_WINDOW_HOURS` (portal-queries.ts):
 *
 * - El socio cancela con su ventana (`CANCELLATION_WINDOW_HOURS`, 24 h por
 *   defecto y 12 h en la copia de la app): fuera de ella pierde la sesión.
 * - El entrenador que saca a alguien de un grupo reducido tiene una ventana
 *   propia de 24 h. Con más margen, la sesión vuelve al bono; dentro de las
 *   24 h previas se consume igualmente, porque la plaza ya no se puede
 *   revender.
 *
 * La excepción es el ajuste manual del saldo (RB-RES-006): quien tiene
 * `canAdjustSessionBalance` —Entrenador Admin, dirección y recepción— puede
 * devolver la sesión de todos modos, y ese override queda en `AuditLog`.
 *
 * Aquí solo vive la DECISIÓN, sin `prisma` ni relojes implícitos: el instante
 * entra como argumento para que la regla se pruebe sin tocar la base ni
 * depender de la hora del runner.
 */

export const TRAINER_DISCARD_WINDOW_HOURS = 24;

export type DiscardInput = {
  /** Instante real de comienzo de la ocurrencia (sessionStartsAt). */
  startsAt: Date;
  now: Date;
  /** Estado de la reserva que se descarta. */
  status: "BOOKED" | "WAITLISTED";
  /** La reserva descontó bono (la lista de espera nunca lo hace). */
  hasSubscription: boolean;
  /** El entrenador ha pedido devolver la sesión estando dentro de la ventana. */
  forceRefund?: boolean;
  /** El rol puede ajustar saldo a mano (RB-RES-006). */
  canForceRefund?: boolean;
};

export type DiscardEffect = {
  /** Horas que faltan para la sesión (negativas si ya empezó). */
  hoursUntil: number;
  /** Estamos dentro de las 24 h previas (o la sesión ya pasó). */
  withinWindow: boolean;
  /** Se devuelve la sesión al bono. */
  refunds: boolean;
  /** Se devuelve solo porque alguien con permiso lo ha forzado. */
  overridden: boolean;
  /** El override se pidió pero el rol no puede: se ignora, no se falla. */
  overrideDenied: boolean;
};

export function trainerDiscardEffect(input: DiscardInput): DiscardEffect {
  const hoursUntil = (input.startsAt.getTime() - input.now.getTime()) / 3_600_000;
  const withinWindow = hoursUntil < TRAINER_DISCARD_WINDOW_HOURS;

  // La lista de espera nunca descontó bono: no hay nada que devolver ni que
  // consumir, y forzar la devolución ahí regalaría una sesión que nadie pagó.
  if (!input.hasSubscription || input.status === "WAITLISTED") {
    return { hoursUntil, withinWindow, refunds: false, overridden: false, overrideDenied: false };
  }

  if (!withinWindow) {
    return { hoursUntil, withinWindow, refunds: true, overridden: false, overrideDenied: false };
  }

  const wants = Boolean(input.forceRefund);
  const may = Boolean(input.canForceRefund);
  return {
    hoursUntil,
    withinWindow,
    refunds: wants && may,
    overridden: wants && may,
    overrideDenied: wants && !may,
  };
}

/**
 * Copy del aviso que la app enseña ANTES de descartar, para que el entrenador
 * vea el efecto exacto sobre el bono. Vive junto a la regla porque es la misma
 * decisión contada en castellano: si un día cambia la ventana, cambian los dos
 * a la vez.
 */
export function describeDiscardEffect(effect: DiscardEffect): string {
  const remaining = formatRemaining(effect.hoursUntil);
  if (!effect.withinWindow) {
    return `Faltan ${remaining}: se le devuelve la sesión al bono. Es la regla de descarte del entrenador; la cancelación del propio socio sigue teniendo su margen.`;
  }
  if (effect.refunds) {
    return `Faltan ${remaining}: dentro de las ${TRAINER_DISCARD_WINDOW_HOURS} h previas la sesión se consumiría, pero se devuelve por ajuste manual del saldo.`;
  }
  return `Faltan ${remaining}: dentro de las ${TRAINER_DISCARD_WINDOW_HOURS} h previas del descarte del entrenador, la sesión se consume igualmente.`;
}

function formatRemaining(hoursUntil: number): string {
  if (hoursUntil <= 0) return "0 min";
  const totalMinutes = Math.round(hoursUntil * 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} d y ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}
