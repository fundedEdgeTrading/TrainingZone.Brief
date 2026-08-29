import type { Prisma } from "@prisma/client";
import { planServiceKind } from "@/lib/members-queries";
import { isSameDay } from "@/lib/session-occurrences";

/**
 * Núcleo compartido de la reserva de una plaza: qué bono la paga, cómo se
 * descuenta sin quedarse en negativo y cómo se reclama una plaza liberada sin
 * que dos personas se queden la misma.
 *
 * Vive aparte de `portal-queries.ts` porque ya no reserva solo el socio desde
 * el portal: la agenda de staff (`agenda-queries.ts`) reserva y cancela plazas
 * en nombre de un cliente concreto, y el tratamiento del bono tiene que ser
 * exactamente el mismo — una reserva hecha desde recepción descuenta y
 * devuelve igual que la que hace el socio con la app.
 */

/** Estados que ocupan plaza en el aforo (la lista de espera no ocupa sitio). */
export const OCCUPYING_STATUSES = ["BOOKED", "ATTENDED", "NO_SHOW"] as const;

/** Plazas ocupadas de UNA ocurrencia (una serie recurrente comparte fila). */
export function occupiedSpots(
  bookings: { status: string; occurrenceDate: Date }[],
  occurrenceDate: Date
): number {
  return bookings.filter(
    (b) => isSameDay(b.occurrenceDate, occurrenceDate) && (OCCUPYING_STATUSES as readonly string[]).includes(b.status)
  ).length;
}

/** Nombre de la modalidad tal y como se le nombra a una persona. */
export const SERVICE_LABEL: Record<string, string> = {
  EP: "entrenamiento personal",
  GROUP: "grupos reducidos",
};

/**
 * ¿Esta cancelación libera una plaza que merezca aviso? (RB-RES-007)
 *
 * Salir de la lista de espera no libera nada (nunca ocupó plaza). Del resto:
 * si la sesión estaba llena, el hueco es una oportunidad para todo el centro;
 * y si hay gente esperando, hay que avisarla aunque la sesión ya no estuviera
 * llena — el aforo se puede haber ampliado después de formarse la lista, y
 * quien esperaba se quedaba sin enterarse del hueco.
 */
export function shouldNotifyVacancy(params: {
  cancelledStatus: string;
  wasFull: boolean;
  hasWaitlist: boolean;
}): boolean {
  return params.cancelledStatus === "BOOKED" && (params.wasFull || params.hasWaitlist);
}

export type BookableSubscription = {
  id: string;
  centerId: string;
  sessionsRemaining: number | null;
  plan: { type: string };
};

/**
 * `NO_PLAN`: ningún bono de esa modalidad en ese centro (RB-AGENDA-003).
 * `NO_BALANCE`: hay bono, pero sin sesiones que descontar (RB-RES-006).
 * Se devuelve el motivo en crudo y no un texto: el mensaje que ve el socio en
 * el portal ("tu plan…") no sirve para el staff, que reserva en nombre de otro.
 */
export type SubscriptionChoice =
  | { ok: true; subscriptionId: string | null }
  | { ok: false; reason: "NO_PLAN" | "NO_BALANCE" };

/**
 * Bono que paga esta plaza: el de la modalidad de la sesión en el centro que la
 * imparte. Con cuota ilimitada (`sessionsRemaining` null) no se descuenta nada;
 * si hay varios bonos con saldo se gasta antes el que menos vida le queda.
 *
 * `consumesSession: false` es la lista de espera: exige igualmente tener bono
 * de esa modalidad (es la frontera que impide apuntarse a una sesión que el
 * plan no cubre) pero no elige de dónde descontar, porque esperar no gasta.
 */
export function pickBookingSubscription(
  subscriptions: BookableSubscription[],
  params: { centerId: string; kind: string; consumesSession: boolean }
): SubscriptionChoice {
  const matching = subscriptions.filter(
    (s) => s.centerId === params.centerId && planServiceKind(s.plan.type) === params.kind
  );
  if (matching.length === 0) return { ok: false, reason: "NO_PLAN" };
  if (!params.consumesSession) return { ok: true, subscriptionId: null };

  const unlimited = matching.find((s) => s.sessionsRemaining == null);
  if (unlimited) return { ok: true, subscriptionId: null };

  const withBalance = matching
    .filter((s) => (s.sessionsRemaining ?? 0) > 0)
    .sort((a, b) => (a.sessionsRemaining ?? 0) - (b.sessionsRemaining ?? 0))[0];
  if (!withBalance) return { ok: false, reason: "NO_BALANCE" };
  return { ok: true, subscriptionId: withBalance.id };
}

/**
 * Descuento condicional: el `sessionsRemaining > 0` viaja DENTRO del UPDATE,
 * así que es la base de datos —y no una lectura previa— la que decide si queda
 * saldo. Es la barrera final contra el bono en negativo cuando dos reservas
 * concurrentes llegan a la vez con el mismo bono.
 */
export async function chargeSessionToSubscription(
  tx: Prisma.TransactionClient,
  subscriptionId: string
): Promise<boolean> {
  const charged = await tx.subscription.updateMany({
    where: { id: subscriptionId, sessionsRemaining: { gt: 0 } },
    data: { sessionsRemaining: { decrement: 1 } },
  });
  return charged.count > 0;
}

/** Devuelve la sesión al bono del que salió (RB-RES-006). */
export async function refundSessionToSubscription(tx: Prisma.TransactionClient, subscriptionId: string) {
  await tx.subscription.update({
    where: { id: subscriptionId },
    data: { sessionsRemaining: { increment: 1 } },
  });
}

/**
 * Reclamo de una plaza liberada por quien estaba en lista de espera. El aviso
 * de hueco sale para TODA la lista a la vez y se la queda quien llegue primero
 * (RB-RES-007), así que la condición "sigue en espera" viaja dentro del propio
 * UPDATE, igual que el descuento de saldo: si dos reclamos entran a la vez,
 * solo uno cuenta `1` y el otro se entera de que la plaza ya no está.
 */
export async function claimWaitlistedBooking(
  tx: Prisma.TransactionClient,
  bookingId: string,
  subscriptionId: string | null
): Promise<boolean> {
  const claimed = await tx.booking.updateMany({
    where: { id: bookingId, status: "WAITLISTED" },
    data: { status: "BOOKED", waitlistPosition: null, subscriptionId },
  });
  return claimed.count > 0;
}
