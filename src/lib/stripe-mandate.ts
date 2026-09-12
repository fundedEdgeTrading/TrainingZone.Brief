import type Stripe from "stripe";
import type { ReconcileResult } from "@/lib/member-billing";

/**
 * HU-ST-12 · SEPA Direct Debit con mandato. **PISTA P1.**
 *
 * MÓDULO VACÍO A PROPÓSITO. S1 lo deja cableado al despachador de webhook para
 * que P1 no tenga que tocar el `switch` compartido. Firmas decididas, eventos
 * registrados; el cuerpo lo escribe P1.
 *
 * El agujero que cierra la historia: SEPA está **declarado pero no soportado**
 * —`payment_method_types` lo incluye, pero sin ningún manejo de su asincronía—,
 * así que un débito devuelto a las semanas no produce hoy NINGÚN efecto en Apta.
 *
 * Tabla y estado que la migración del lote ya dejó puestos:
 *   · `SepaMandate` (referencia UMR, `ibanLast4`, estado, `acceptedAt`), con
 *     unicidad `(orgId, stripeMandateId)` → upsert idempotente, y enlazado
 *     desde `Subscription.sepaMandateId`.
 *   · `SubscriptionStatus.PENDING_CONFIRMATION`.
 *
 * RB-PAGO-025 — **un cobro asíncrono no da acceso hasta liquidar**. El motor de
 * reservas filtra por `status === "ACTIVE"`, así que dejar la suscripción en
 * PENDING_CONFIRMATION es lo que corta el acceso; no hace falta nada más, y
 * ponerla ACTIVE "provisionalmente" lo rompería.
 */

/**
 * `mandate.updated` · El banco confirma, revoca o deja caducar el mandato.
 * Escribe el estado en `SepaMandate`; un mandato revocado NO se borra (hay
 * cobros conciliados que lo citan como autorización).
 */
export async function reconcileMandateUpdated(
  orgId: string,
  mandate: Stripe.Mandate
): Promise<ReconcileResult> {
  console.info("[stripe-mandate] mandate.updated pendiente de implementar (HU-ST-12, P1)", {
    orgId,
    mandateId: mandate.id,
    status: mandate.status,
    reference: mandate.payment_method_details?.sepa_debit?.reference ?? null,
  });
  return { ok: true };
}

/**
 * `checkout.session.async_payment_succeeded` / `checkout.session.async_payment_failed`
 * · El desenlace del primer cobro por adeudo directo, que llega días después
 * del checkout.
 *
 *   · succeeded → la suscripción sale de PENDING_CONFIRMATION y se activa el
 *     acceso.
 *   · failed    → el `Payment` queda FAILED y arranca el dunning (HU-ST-18).
 *
 * `eventType` distingue los dos: la sesión por sí sola no siempre lo deja claro.
 */
export async function reconcileAsyncPayment(
  orgId: string,
  session: Stripe.Checkout.Session,
  eventType: string
): Promise<ReconcileResult> {
  console.info("[stripe-mandate] checkout.session.async_payment_* pendiente de implementar (HU-ST-12, P1)", {
    orgId,
    eventType,
    sessionId: session.id,
    paymentStatus: session.payment_status,
  });
  return { ok: true };
}
