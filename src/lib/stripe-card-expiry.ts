import type Stripe from "stripe";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-22 · Tarjetas por caducar. **PISTA P1.**
 *
 * MÓDULO VACÍO A PROPÓSITO. S1 lo deja cableado al despachador de webhook para
 * que P1 no tenga que tocar el `switch` compartido. Firma decidida, evento
 * registrado; el cuerpo lo escribe P1.
 *
 * Los dos eventos son las dos caras de lo mismo y por eso comparten
 * reconciliador:
 *   · `customer.source.expiring` → la tarjeta caduca el mes que viene: hay que
 *     avisar al socio con enlace al Billing Portal (HU-ST-17).
 *   · `payment_method.automatically_updated` → la red (Visa/Mastercard Account
 *     Updater) ya ha refrescado la tarjeta sola: el aviso deja de aplicar y hay
 *     que retirarlo, o dirección persigue a un socio cuyo cobro va a entrar sin
 *     problema.
 *
 * Se recibe el `Stripe.Event` entero y no el objeto porque los dos eventos
 * traen tipos DISTINTOS (`Card`/`Source` frente a `PaymentMethod`), y estrechar
 * la firma aquí obligaría a P1 a deshacer el estrechamiento.
 *
 * El panel del escenario "dirección ve cuántos socios tienen el método a punto
 * de caducar" se calcula, no se persiste: no hay columna nueva para esto en la
 * migración del lote, a propósito.
 */
export async function reconcileCardExpiry(
  orgId: string,
  event: Stripe.Event
): Promise<ReconcileResult> {
  console.info("[stripe-card-expiry] evento pendiente de implementar (HU-ST-22, P1)", {
    orgId,
    eventType: event.type,
    objectId: (event.data.object as { id?: string }).id ?? null,
  });
  return { ok: true };
}
