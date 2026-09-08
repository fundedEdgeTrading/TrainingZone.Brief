import type Stripe from "stripe";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-23 · Neto real, comisiones y payouts. **PISTA P4.**
 *
 * MÓDULO VACÍO A PROPÓSITO. S1 lo deja cableado al despachador de webhook y con
 * el punto de enganche ya llamado desde la conciliación de `member-billing.ts`,
 * para que P4 no tenga que tocar ninguno de los dos ficheros compartidos.
 * Firmas decididas, eventos registrados; el cuerpo lo escribe P4.
 *
 * Tablas y columnas que la migración del lote ya dejó puestas:
 *   · `StripePayout` (importe, `arrivalDate`, estado, motivo del fallo), con
 *     unicidad `(orgId, stripePayoutId)` → upsert idempotente.
 *   · `Payment.grossAmountCents` / `feeAmountCents` / `netAmountCents` /
 *     `stripeBalanceTransactionId` / `payoutId`.
 *
 * El cuadre del escenario "suma de netos == importe del payout" solo sale si
 * las dos mitades se escriben: el desglose por cobro (`recordBalanceBreakdown`)
 * y la liquidación (`reconcilePayout`).
 */

/**
 * `payout.paid` / `payout.failed` · La liquidación de Stripe a la cuenta
 * bancaria del gimnasio.
 *
 * Para saber QUÉ cobros lo componen hay que listar los balance transactions del
 * payout (`balanceTransactions.list({ payout })`) contra la cuenta conectada:
 * el objeto `Payout` no los trae. `stripeReadClient()` en `lib/billing-shared.ts`
 * da el cliente de solo lectura para eso.
 */
export async function reconcilePayout(
  orgId: string,
  payout: Stripe.Payout,
  eventType: string
): Promise<ReconcileResult> {
  console.info("[stripe-balance] payout.* pendiente de implementar (HU-ST-23, P4)", {
    orgId,
    eventType,
    payoutId: payout.id,
    amount: payout.amount,
    arrivalDate: payout.arrival_date,
    status: payout.status,
  });
  return { ok: true };
}

/**
 * PUNTO DE ENGANCHE del desglose, llamado desde `reconcileMemberInvoicePaid()`
 * en `member-billing.ts` en cuanto el cobro queda conciliado. **Hoy no hace
 * nada**; P4 lo rellena.
 *
 * `charge` es lo que la factura sabe del cargo: el id (lo normal) o el objeto
 * ya expandido. Para llegar al bruto/comisión/neto hay que traerse el balance
 * transaction del cargo contra la cuenta conectada — de ahí que P4 tenga que
 * resolverlo aquí y no en el call site.
 *
 * DEVUELVE `void` Y NO PUEDE LANZAR. Es un enganche contable colgado del camino
 * del cobro: si revienta o devuelve un fallo, tumba la conciliación de un pago
 * que SÍ ha entrado y Stripe reintenta un `invoice.paid` que ya estaba bien.
 * El desglose es reconstruible después; el cobro no. P4: captura tus errores
 * aquí dentro y regístralos, no los propagues.
 */
export async function recordBalanceBreakdown(
  paymentId: string,
  charge: Stripe.Charge | string | null
): Promise<void> {
  console.info("[stripe-balance] desglose pendiente de implementar (HU-ST-23, P4)", {
    paymentId,
    chargeId: typeof charge === "string" ? charge : (charge?.id ?? null),
  });
}
