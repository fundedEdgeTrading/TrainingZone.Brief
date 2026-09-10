import type Stripe from "stripe";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-20 · Reembolsos reales y notas de crédito (decisión D-S7). **PISTA P2.**
 *
 * MÓDULO VACÍO A PROPÓSITO. Lo deja S1 cableado al despachador de webhook
 * (`api/stripe/webhook/route.ts`) para que P2 no tenga que tocar el `switch`:
 * cinco pistas necesitaban añadirle casos y se habrían pisado las cinco. Aquí
 * están las firmas ya decididas y el evento se registra; el cuerpo lo escribe
 * P2.
 *
 * Lo que ya está resuelto y P2 NO tiene que rehacer:
 *   · La deduplicación por `event.id` (HU-ST-05) envuelve también estos casos:
 *     el despachador reclama el evento antes de llamar aquí, así que una
 *     reentrega no vuelve a entrar.
 *   · Devolver `{ ok: false, retry: true }` hace que la ruta responda 500 y
 *     Stripe reintente con backoff. Es lo que hay que hacer cuando el `Payment`
 *     todavía no existe localmente: Stripe NO garantiza el orden de entrega, y
 *     un `charge.refunded` puede adelantar al `invoice.paid` que crea la fila.
 *
 * Columnas que la migración del lote ya dejó puestas (no hace falta pedirlas):
 *   · `Payment.stripeRefundId`, `refundedAmountCents`, `refundReason`,
 *     `refundedAt`, `refundedByUserId`
 *   · `Payment.stripeCreditNoteId`
 *
 * Y el guardián compartido para el lado de escritura (emitir el refund desde
 * Apta) es `assertRefundable()` en `lib/billing-shared.ts`: un pago en efectivo
 * no llama a Stripe y un pago ya devuelto no se devuelve dos veces.
 */

/**
 * `charge.refunded` · El refund ya se emitió en la cuenta conectada (desde Apta
 * o desde el Dashboard) y Stripe lo confirma. Aquí es donde el `Payment` pasa a
 * REFUNDED con su `stripeRefundId` y su importe devuelto.
 *
 * Ojo con la devolución PARCIAL: `charge.amount_refunded` es el acumulado, no
 * el importe de este refund, y `charge.refunded` es `true` solo cuando está
 * devuelto del todo. Un parcial deja `amountCents` intacto y solo escribe
 * `refundedAmountCents`.
 */
export async function reconcileChargeRefunded(
  orgId: string,
  charge: Stripe.Charge
): Promise<ReconcileResult> {
  console.info("[stripe-refunds] charge.refunded pendiente de implementar (HU-ST-20, P2)", {
    orgId,
    chargeId: charge.id,
    amountRefunded: charge.amount_refunded,
    refunded: charge.refunded,
  });
  return { ok: true };
}

/**
 * `credit_note.created` / `credit_note.updated` / `credit_note.voided` · Nota de
 * crédito sobre una factura de suscripción. Se enlaza al `Payment` de esa
 * factura (`stripeCreditNoteId`).
 *
 * `eventType` viene del despachador porque una nota anulada (`voided`) NO es lo
 * mismo que una emitida y el objeto por sí solo no lo dice de forma cómoda.
 */
export async function reconcileCreditNote(
  orgId: string,
  creditNote: Stripe.CreditNote,
  eventType: string
): Promise<ReconcileResult> {
  console.info("[stripe-refunds] credit_note.* pendiente de implementar (HU-ST-20, P2)", {
    orgId,
    eventType,
    creditNoteId: creditNote.id,
    invoiceId: typeof creditNote.invoice === "string" ? creditNote.invoice : creditNote.invoice?.id,
  });
  return { ok: true };
}
