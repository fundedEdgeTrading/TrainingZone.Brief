import type Stripe from "stripe";

/**
 * HU-ST-02 · Lectura de facturas de Stripe, compartida por los DOS planos.
 *
 * En la versión de API que tipa el SDK instalado (22.5.0, `2026-07-29.dahlia`)
 * `Invoice` ya **no** tiene `subscription` de primer nivel: se movió a
 * `invoice.parent.subscription_details.subscription`. El plano 2
 * (`member-billing.ts`) ya lo tenía resuelto; el plano 1 se quedó leyendo el
 * shape legado, así que `subscriptionId` salía siempre `null` y
 * `invoice.paid` **nunca renovaba** ni `invoice.payment_failed` ponía
 * `PAST_DUE`: un gimnasio que dejaba de pagar la licencia conservaba el acceso
 * para siempre.
 *
 * Se comprueban los dos shapes: una cuenta pinneada a una versión antigua de la
 * API sigue entregando el campo legado, y debe resolverse igual.
 */
export function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { subscription?: string | Stripe.Subscription | null }).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;

  const viaParent = invoice.parent?.subscription_details?.subscription;
  if (typeof viaParent === "string") return viaParent;
  if (viaParent && typeof viaParent === "object") return viaParent.id;

  return null;
}

/**
 * Fin del periodo cubierto por la factura, en epoch de segundos.
 *
 * Se toma el MÁXIMO de las líneas y no `lines.data[0]`: una factura de
 * prorrateo (HU-ST-13) trae varias líneas —el crédito del plan viejo y el cargo
 * del nuevo— y la primera puede ser la del periodo que se está cerrando. Con
 * `[0]` el `currentPeriodEnd` podía retroceder justo después de un cambio de
 * plan, dejando a la organización con la licencia caducada al día siguiente de
 * pagarla.
 */
export function resolveInvoicePeriodEnd(invoice: Stripe.Invoice): Date | null {
  const ends = (invoice.lines?.data ?? [])
    .map((line) => line.period?.end)
    .filter((end): end is number => typeof end === "number" && end > 0);
  if (ends.length === 0) return null;
  return new Date(Math.max(...ends) * 1000);
}

/**
 * HU-ST-23 · Referencia del CARGO de una factura, para poder pedir su balance
 * transaction (bruto/comisión/neto).
 *
 * En la versión de API que tipa el SDK instalado, `Invoice` **ya no tiene
 * `charge` de primer nivel**: el cargo se alcanza por
 * `invoice.payments[].payment.payment_intent` → `latest_charge`, que es una
 * llamada de red y no una lectura. Por eso esta función devuelve `null` en ese
 * caso en vez de fingir que lo sabe.
 *
 * Se mantiene la lectura del campo LEGADO por el mismo motivo que
 * `resolveInvoiceSubscriptionId`: una cuenta conectada pinneada a una versión
 * antigua de la API lo sigue entregando, y ahí sí se ahorra la llamada.
 *
 * Quien necesite el cargo sí o sí (P4) resuelve el `null` con el cliente de
 * solo lectura de la cuenta conectada; este helper es el atajo, no el camino.
 */
export function resolveInvoiceChargeId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as unknown as { charge?: string | Stripe.Charge | null }).charge;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.id;
  return null;
}
