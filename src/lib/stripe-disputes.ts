import type Stripe from "stripe";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-21 · Disputas y contracargos visibles (decisión D-S7). **PISTA P2.**
 *
 * MÓDULO VACÍO A PROPÓSITO. S1 lo deja cableado al despachador de webhook para
 * que P2 no tenga que tocar el `switch` compartido. Firmas decididas, evento
 * registrado; el cuerpo lo escribe P2.
 *
 * Lo que ya está resuelto:
 *   · Deduplicación por `event.id` (HU-ST-05) — el despachador reclama el
 *     evento antes de llamar aquí.
 *   · `{ ok: false, retry: true }` → 500 y Stripe reintenta. Es lo correcto
 *     cuando el `Payment` del cargo disputado aún no existe localmente.
 *
 * Tabla que la migración del lote ya dejó puesta: `PaymentDispute`, con
 * `amountCents`, `evidenceDueBy` (el `evidence_details.due_by` que hace urgente
 * la tarea: pasado sin responder, la disputa se pierde sola) y `status`
 * (NEEDS_RESPONSE → UNDER_REVIEW → WON/LOST). La unicidad es
 * `(orgId, stripeDisputeId)`, así que un upsert por esa clave es idempotente
 * frente a los tres eventos del ciclo.
 *
 * Alcance de esta fase (escenario "aportar evidencia"): Apta NO sube evidencia;
 * enlaza al Dashboard de Stripe. Lo que sí hace es abrir la tarea a dirección
 * con importe y fecha límite, y resolverla al cerrarse.
 */

/**
 * `charge.dispute.created` / `charge.dispute.updated` / `charge.dispute.closed`.
 *
 * Un solo reconciliador para los tres: el objeto `Dispute` ya trae `status` y
 * `amount`, y lo que cambia entre eventos es el efecto lateral (abrir la tarea
 * de dirección vs. resolverla), no la lectura. `eventType` es lo que permite
 * distinguirlos sin adivinar por el estado.
 */
export async function reconcileDispute(
  orgId: string,
  dispute: Stripe.Dispute,
  eventType: string
): Promise<ReconcileResult> {
  console.info("[stripe-disputes] charge.dispute.* pendiente de implementar (HU-ST-21, P2)", {
    orgId,
    eventType,
    disputeId: dispute.id,
    amount: dispute.amount,
    status: dispute.status,
    evidenceDueBy: dispute.evidence_details?.due_by ?? null,
  });
  return { ok: true };
}
