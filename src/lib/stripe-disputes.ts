import type Stripe from "stripe";
import type { ReconcileResult } from "@/lib/member-billing";
import { reconcileSepaReturn } from "@/lib/stripe-mandate";

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
  // HU-ST-12 (pista P1) · Una disputa sobre un cobro SEPA es la otra cara de la
  // devolución bancaria: el dinero se retiene y el socio deja de estar al
  // corriente. El resto del ciclo de la disputa (tarea de dirección, evidencia,
  // cierre) es HU-ST-21 y lo escribe P2 — conserva esta derivación al hacerlo.
  if (eventType === "charge.dispute.created" && isSepaDispute(dispute)) {
    const result = await reconcileSepaReturn({
      orgId,
      chargeId: typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
      paymentIntentId:
        typeof dispute.payment_intent === "string" ? dispute.payment_intent : (dispute.payment_intent?.id ?? null),
      amountCents: dispute.amount,
      outcome: "FAILED",
      reason: "DISPUTE",
    });
    if (!result.ok) return result;
  }

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

/**
 * ¿La disputa es sobre un adeudo SEPA? `payment_method_details` de la disputa
 * lleva el instrumento del cargo original; sin él no se puede afirmar, y
 * tratarlo como SEPA marcaría moroso a quien hizo un contracargo de tarjeta
 * antes de que HU-ST-21 decida qué hacer con él.
 */
function isSepaDispute(dispute: Stripe.Dispute): boolean {
  return dispute.payment_method_details?.type === "sepa_debit";
}
