import type { Prisma, SessionLedgerReason } from "@prisma/client";

/**
 * E2-15 (decisión D-P7) · RB-VENTA-008: el libro mayor del bono.
 *
 * Va DESPUÉS de E2-01 y E2-02 a propósito, y la razón es la de la decisión: un
 * libro mayor construido sobre un modelo que pierde movimientos solo documenta
 * el error con más precisión. Con las fugas tapadas, esto es lo que cuadra.
 *
 * Lo que había antes, verificado en la misma pantalla: la tarjeta decía "5
 * gastadas de 12", el resumen decía "0 gastadas" y "9 no presentadas", y el
 * listado que promete *"aquí aparece cada sesión gastada y cada devolución"* no
 * tenía ni una línea de consumo. La causa: el movimiento se derivaba de
 * `booking.subscriptionId`, y 1.458 de 1.458 `ATTENDED` y 155 de 155 `NO_SHOW`
 * lo tenían a NULL (la cancelación lo pone a null, y la reserva de staff a mano
 * nunca lo puso). Las devoluciones se leían solo de `AuditLog`, que únicamente
 * escribía el descarte móvil.
 *
 * INVARIANTE DEL TRIMESTRE: ninguna operación mueve `sessionsRemaining` sin
 * escribir aquí, EN LA MISMA TRANSACCIÓN. Por eso este módulo no expone un
 * "apunta esto" suelto: expone las operaciones (`chargeSession`,
 * `refundSession`, `adjustSessions`), que mueven el saldo y dejan el asiento a
 * la vez. Un asiento es inmutable: una corrección es otro asiento
 * (`CORRECTION`), nunca una edición.
 */

export type LedgerContext = {
  orgId: string;
  subscriptionId: string;
  /** Reserva que provoca el movimiento, cuando la hay. */
  bookingId?: string | null;
  reason: SessionLedgerReason;
  /** `null` = el sistema (cron, webhook de Stripe). */
  actorUserId?: string | null;
  note?: string | null;
};

/**
 * Escribe el asiento leyendo el saldo YA aplicado de la propia fila, en vez de
 * calcularlo a mano: `balanceAfter` tiene que ser lo que hay en la tabla, no lo
 * que el llamador cree que debería haber.
 *
 * Un bono ilimitado (`sessionsRemaining` null) también deja asiento, con
 * `balanceAfter` null: interesa saber que se usó, aunque no descuente.
 */
async function writeEntry(tx: Prisma.TransactionClient, ctx: LedgerContext, delta: number): Promise<void> {
  if (delta === 0) return; // un asiento que no mueve saldo no es un asiento
  const subscription = await tx.subscription.findUnique({
    where: { id: ctx.subscriptionId },
    select: { sessionsRemaining: true },
  });
  await tx.sessionLedger.create({
    data: {
      orgId: ctx.orgId,
      subscriptionId: ctx.subscriptionId,
      bookingId: ctx.bookingId ?? null,
      delta,
      balanceAfter: subscription?.sessionsRemaining ?? null,
      reason: ctx.reason,
      actorUserId: ctx.actorUserId ?? null,
      note: ctx.note ?? null,
    },
  });
}

/**
 * Descuento de una sesión. El `sessionsRemaining > 0` viaja DENTRO del UPDATE,
 * así que es la base de datos —y no una lectura previa— la que decide si queda
 * saldo: es la barrera final contra el bono en negativo cuando dos reservas
 * concurrentes llegan con el mismo bono. Si no se aplica, no hay asiento.
 */
export async function chargeSession(tx: Prisma.TransactionClient, ctx: LedgerContext): Promise<boolean> {
  const charged = await tx.subscription.updateMany({
    where: { id: ctx.subscriptionId, sessionsRemaining: { gt: 0 } },
    data: { sessionsRemaining: { decrement: 1 } },
  });
  if (charged.count === 0) return false;
  await writeEntry(tx, ctx, -1);
  return true;
}

/** Devolución de una sesión al bono del que salió (RB-RES-006). */
export async function refundSession(tx: Prisma.TransactionClient, ctx: LedgerContext): Promise<void> {
  await tx.subscription.update({
    where: { id: ctx.subscriptionId },
    data: { sessionsRemaining: { increment: 1 } },
  });
  await writeEntry(tx, ctx, 1);
}

/**
 * Movimiento de tamaño arbitrario: el alta o renovación de un bono (+N) y el
 * ajuste manual del saldo desde la ficha. `applied` deja al llamador decidir la
 * condición del UPDATE (el ajuste manual tiene sus propios topes); aquí solo se
 * anota lo que se ha aplicado de verdad.
 */
export async function recordSessionsChange(
  tx: Prisma.TransactionClient,
  ctx: LedgerContext,
  delta: number
): Promise<void> {
  await writeEntry(tx, ctx, delta);
}

// ---------------------------------------------------------------------------
// Lectura: la parte pura, para que el cuadre se pueda probar sin base de datos
// ---------------------------------------------------------------------------

export type LedgerRow = { delta: number; reason: SessionLedgerReason };

/** Saldo que describe el libro: la suma con signo de todos sus asientos. */
export function ledgerBalance(rows: LedgerRow[]): number {
  return rows.reduce((sum, r) => sum + r.delta, 0);
}

/**
 * Cuadre (escenario "cuadre"): la suma de deltas de una suscripción tiene que
 * ser igual a su `sessionsRemaining`. Con la fila de apertura del histórico
 * previo, esto vale también para los bonos anteriores al libro.
 */
export function ledgerReconciles(rows: LedgerRow[], sessionsRemaining: number | null): boolean {
  if (sessionsRemaining == null) return true; // bono ilimitado: no hay saldo que cuadrar
  return ledgerBalance(rows) === sessionsRemaining;
}

/** Consumos y devoluciones por separado, que es como los cuenta la pantalla. */
export function ledgerTotals(rows: LedgerRow[]): { spent: number; returned: number } {
  return {
    spent: rows.filter((r) => r.delta < 0).reduce((sum, r) => sum - r.delta, 0),
    returned: rows.filter((r) => r.delta > 0 && r.reason !== "PURCHASE").reduce((sum, r) => sum + r.delta, 0),
  };
}

/** Etiqueta en castellano de cada motivo, compartida por el portal y la app. */
export const LEDGER_REASON_LABEL: Record<SessionLedgerReason, string> = {
  PURCHASE: "Alta del bono",
  BOOKING: "Sesión reservada",
  CANCELLATION: "Sesión devuelta por cancelación",
  NO_SHOW_REFUND: "Sesión devuelta tras una falta",
  MANUAL_ADJUSTMENT: "Ajuste manual del saldo",
  EXPIRY: "Caducidad del bono",
  CORRECTION: "Corrección",
};

/**
 * Fila de apertura del histórico previo (escenario "histórico previo"): un
 * asiento `CORRECTION` con el saldo actual del bono para las suscripciones que
 * existían antes del libro. Sin ella el cuadre no puede dar, porque los
 * movimientos viejos no están.
 *
 * Se escribe UNA vez por suscripción: la condición es que no tenga ningún
 * asiento. Devuelve cuántas ha creado.
 */
export async function backfillOpeningEntries(
  tx: Prisma.TransactionClient,
  orgId: string
): Promise<number> {
  const subscriptions = await tx.subscription.findMany({
    where: { center: { orgId }, ledger: { none: {} }, sessionsRemaining: { not: null } },
    select: { id: true, sessionsRemaining: true },
  });

  let created = 0;
  for (const subscription of subscriptions) {
    const balance = subscription.sessionsRemaining ?? 0;
    // Un bono agotado no deja asiento de apertura: su saldo es 0 y un asiento
    // de delta 0 no es un asiento. El cuadre sigue dando (0 = 0).
    if (balance === 0) continue;
    await tx.sessionLedger.create({
      data: {
        orgId,
        subscriptionId: subscription.id,
        delta: balance,
        balanceAfter: balance,
        reason: "CORRECTION",
        note: "Saldo de apertura: los movimientos anteriores a esta fecha no están en el libro.",
      },
    });
    created++;
  }
  return created;
}
