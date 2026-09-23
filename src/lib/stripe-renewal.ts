import type { Prisma } from "@prisma/client";
import { recordSessionsChange } from "@/lib/session-ledger";

/**
 * STR-01 · Recarga de sesiones en la renovación de una cuota recurrente.
 *
 * `invoice.paid` concilia el cobro, pero nadie volvía a poner sesiones en el
 * bono: un `MONTHLY` de 8 sesiones arrancaba con 8 (las del alta, en
 * `createSubscriptionFromPlan`) y se quedaba a 0 desde el segundo mes, pagando
 * cada mes una cuota que no daba acceso a nada.
 *
 * Va en la MISMA transacción que el `Payment` de la factura: si el cobro no
 * queda escrito, las sesiones tampoco, y al revés.
 */

type Tx = Prisma.TransactionClient;

/**
 * Decisión de negocio D3: en la renovación, las sesiones que sobran del periodo
 * anterior NO se acumulan. Se cierra el saldo con un asiento `EXPIRY` y se abre
 * el del periodo nuevo con un `PURCHASE` por lo que incluye el plan.
 *
 * Con `true`, el saldo anterior se conserva y el `PURCHASE` se suma encima.
 */
export const RENEWAL_CARRYOVER = false;

/**
 * Los motivos de factura que son una renovación. `subscription_create` NO está:
 * el primer periodo ya lo abre el alta (`createSubscriptionFromPlan`), y
 * recargarlo aquí daría el doble de sesiones el primer mes.
 *
 * `subscription_update` sí: es la factura que emite el adelanto de pago (P4), y
 * el contrato con esa pista es que recarga exactamente igual que un ciclo.
 */
export const RENEWAL_BILLING_REASONS: ReadonlySet<string> = new Set(["subscription_cycle", "subscription_update"]);

export function isRenewalBillingReason(billingReason: string | null | undefined): boolean {
  return billingReason != null && RENEWAL_BILLING_REASONS.has(billingReason);
}

export type RenewalMovements = {
  /** Asiento `EXPIRY` (≤ 0). 0 = no hay nada que caducar. */
  expiry: number;
  /** Asiento `PURCHASE` (> 0). */
  purchase: number;
  /** Saldo tras los dos asientos. */
  sessionsRemaining: number;
};

/**
 * Los movimientos de la renovación, sin base de datos. `null` = no hay nada que
 * recargar: un bono ilimitado (saldo `null`) o un plan sin sesiones incluidas.
 *
 * Un saldo negativo no debería existir (`chargeSession` no baja de 0), pero si
 * existiera no se "caduca" en positivo: solo se cierra lo que sobra.
 */
export function planRenewalMovements(params: {
  sessionsRemaining: number | null;
  sessionsIncluded: number | null;
  carryover: boolean;
}): RenewalMovements | null {
  const { sessionsRemaining, sessionsIncluded, carryover } = params;
  if (sessionsRemaining == null || sessionsIncluded == null || sessionsIncluded <= 0) return null;

  const leftover = Math.max(sessionsRemaining, 0);
  if (carryover) {
    return { expiry: 0, purchase: sessionsIncluded, sessionsRemaining: leftover + sessionsIncluded };
  }
  return { expiry: -leftover, purchase: sessionsIncluded, sessionsRemaining: sessionsIncluded };
}

/** Marca del asiento de recarga: lo que hace la recarga idempotente por factura. */
export function renewalLedgerNote(invoiceId: string): string {
  return `Renovación Stripe · factura ${invoiceId}`;
}

export type RefillResult =
  | { refilled: false; reason: "not-renewal" | "already-refilled" | "nothing-to-refill" | "not-found" }
  | { refilled: true; movements: RenewalMovements };

/**
 * Recarga el bono de una suscripción recurrente al cobrarse su renovación.
 *
 * Idempotente por factura: la reentrega del mismo `invoice.paid` ya la corta el
 * llamante al ver el `Payment` PAID, pero no basta — una factura de renovación
 * que falla y Stripe cobra en un reintento llega con su `Payment` ya existente
 * (en FAILED), y ESA sí tiene que recargar, una sola vez. La prueba de que ya se
 * recargó es el propio asiento `PURCHASE` marcado con la factura.
 */
export async function refillOnRenewal(
  tx: Tx,
  params: {
    subscriptionId: string;
    invoiceId: string;
    billingReason: string | null | undefined;
    /** Fin del periodo que paga la factura (`period.end` de su línea). */
    periodEnd?: Date | null;
    /** Solo para probar la otra rama de D3; en producción manda la constante. */
    carryover?: boolean;
  }
): Promise<RefillResult> {
  if (!isRenewalBillingReason(params.billingReason)) return { refilled: false, reason: "not-renewal" };

  const note = renewalLedgerNote(params.invoiceId);
  const done = await tx.sessionLedger.findFirst({
    where: { subscriptionId: params.subscriptionId, reason: "PURCHASE", note },
    select: { id: true },
  });
  if (done) return { refilled: false, reason: "already-refilled" };

  const subscription = await tx.subscription.findUnique({
    where: { id: params.subscriptionId },
    select: {
      id: true,
      sessionsRemaining: true,
      plan: { select: { sessionsIncluded: true } },
      member: { select: { orgId: true } },
    },
  });
  if (!subscription) return { refilled: false, reason: "not-found" };

  const movements = planRenewalMovements({
    sessionsRemaining: subscription.sessionsRemaining,
    sessionsIncluded: subscription.plan.sessionsIncluded,
    carryover: params.carryover ?? RENEWAL_CARRYOVER,
  });
  if (!movements) return { refilled: false, reason: "nothing-to-refill" };

  const ctx = { orgId: subscription.member.orgId, subscriptionId: subscription.id, actorUserId: null };

  // Dos asientos y no uno neto: el libro tiene que contar que se perdieron N
  // sesiones y se compraron M, no un "+M−N" que no explica nada a recepción.
  // Cada UPDATE va antes de su asiento porque el asiento lee el saldo ya
  // aplicado (`balanceAfter`).
  if (movements.expiry < 0) {
    await tx.subscription.update({ where: { id: subscription.id }, data: { sessionsRemaining: 0 } });
    await recordSessionsChange(
      tx,
      { ...ctx, reason: "EXPIRY", note: `Fin de periodo · factura ${params.invoiceId}` },
      movements.expiry
    );
  }

  await tx.subscription.update({
    where: { id: subscription.id },
    data: {
      sessionsRemaining: movements.sessionsRemaining,
      // El total del periodo, para que "gastadas de N" se cuente contra lo que
      // hay en ESTE periodo y no contra el del alta.
      sessionsIncluded: movements.sessionsRemaining,
      ...(params.periodEnd ? { endDate: params.periodEnd } : {}),
    },
  });
  await recordSessionsChange(tx, { ...ctx, reason: "PURCHASE", note }, movements.purchase);

  return { refilled: true, movements };
}
