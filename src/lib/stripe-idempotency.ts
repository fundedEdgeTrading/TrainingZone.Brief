/**
 * HU-ST-04 / RB-PAGO-022 · Claves de idempotencia para toda creación contra
 * Stripe.
 *
 * `grep idempotencyKey src/` devolvía **cero resultados**: cualquier reintento
 * de red —el que hace el propio SDK, un doble clic de recepción, un usuario
 * recargando— podía duplicar un producto, un precio, un cliente o un cobro.
 *
 * ## Patrón
 *
 * ```
 * <recurso>:<orgId>:<entidad>:<versión>
 * ```
 *
 * - `recurso`: el objeto de Stripe que se crea (`product`, `price`, `customer`,
 *   `checkout`, `refund`…).
 * - `orgId`: la organización dueña de la operación. En el plano 1 (Apta cobra la
 *   licencia) todavía no hay organización cuando se crea el checkout, así que se
 *   usa `platform`.
 * - `entidad`: lo que identifica de forma estable ESA creación concreta (el plan,
 *   el socio, el importe…). Las partes se unen con `_`.
 * - `versión`: `v1`. Se sube cuando cambia lo que se envía a Stripe con la misma
 *   entidad y hace falta forzar una creación nueva.
 *
 * Stripe guarda una clave durante 24 h: repetir la misma petición devuelve la
 * **misma respuesta** en vez de crear un segundo objeto.
 *
 * ## Registro de claves en uso
 *
 * | Clave | Dónde | Qué protege |
 * |---|---|---|
 * | `product:<orgId>:<planId>:v1` | `ensureStripePrice` | un solo Product por plan |
 * | `price:<orgId>:<planId>_<importe>:v1` | `ensureStripePrice` | un solo Price por (plan, importe) |
 * | `customer:<orgId>:<memberId>:v1` | `createMemberCheckout` | un solo cliente por socio |
 * | `checkout:<orgId>:<memberId>_<planId>_<ventana>:v1` | `createMemberCheckout` | un solo checkout por venta |
 * | `checkout:<orgId>:<email>_<planId>_<ventana>:v1` | `createProspectMemberCheckout` | un solo checkout por prospecto |
 * | `customer:platform:<orgId>:v1` | `createPlatformCheckoutSession` | un solo cliente de licencia por org |
 * | `checkout:platform:<orgId>_<planCode>_<ventana>:v1` | `createPlatformCheckoutSession` | un solo checkout de licencia |
 * | `refund:<orgId>:<paymentId>_<importe>_<yaDevuelto>:v1` | `issueRefund` (HU-ST-20) | un solo refund por doble clic |
 * | `credit_note:<orgId>:<invoiceId>_<importe>_<yaDevuelto>:v1` | `issueRefund` (HU-ST-20) | una sola nota de crédito por doble clic |
 * | `invoicepay:<orgId>:<invoiceId>_<ventana>:v1` | `retryOpenInvoice` (HU-ST-19) | un solo intento de cobro por "Pagar ahora" |
 * | `coupon:<orgId>:<código>:v1` | `createCoupon` (HU-ST-27) | un solo Coupon por código |
 * | `promocode:<orgId>:<código>:v1` | `createCoupon` (HU-ST-27) | un solo PromotionCode por código |
 *
 * Cuando se añada una creación nueva, se añade su fila aquí. Una creación sin
 * clave es un duplicado esperando a un reintento de red.
 *
 * ## La única creación SIN clave, a propósito
 *
 * `createLicenseCheckoutSession` (alta pago-primero, `/planes`) es anónima: no
 * hay organización ni socio, y lo único con lo que se podría construir una clave
 * es el plan y una ventana temporal. Esa clave sería **peligrosa**: dos personas
 * distintas comprando el mismo plan en los mismos diez minutos recibirían la
 * MISMA sesión de checkout de Stripe —la segunda pagaría dentro de la sesión de
 * la primera—. Un checkout de licencia abandonado no deja rastro que purgar
 * (`provisionOrganizationFromCheckout` solo actúa al confirmarse el pago), así
 * que el duplicado que se evita no cuesta nada y el que se provocaría sí.
 * Cuando el alta recoja un identificador del comprador antes de crear la sesión,
 * ese identificador entra en la clave y esta excepción desaparece.
 */

/** Ventana de agrupación de los checkouts: 10 minutos (HU-ST-04). */
export const CHECKOUT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Cubo temporal de 10 minutos. Dos intentos de venta seguidos caen en el mismo
 * cubo y comparten sesión de checkout; una venta legítima del mismo plan al
 * mismo socio media hora después cae en otro y abre una sesión nueva.
 *
 * Es un cubo fijo y no una ventana deslizante a propósito: la clave tiene que
 * poder recalcularse igual desde otro proceso sin consultar nada.
 */
export function checkoutWindow(at: Date = new Date()): string {
  return String(Math.floor(at.getTime() / CHECKOUT_WINDOW_MS));
}

/** Construye la clave con el patrón documentado. Las partes vacías se descartan. */
export function idempotencyKey(
  resource: string,
  orgId: string,
  entity: string | string[],
  version = "v1"
): string {
  const parts = (Array.isArray(entity) ? entity : [entity])
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("_");
  return `${resource}:${orgId}:${parts}:${version}`;
}

/** `product:<orgId>:<planId>:v1` */
export function productKey(orgId: string, planId: string) {
  return idempotencyKey("product", orgId, planId);
}

/**
 * `price:<orgId>:<planId>_<importe>:v1`
 *
 * El importe entra en la clave porque un cambio de precio debe crear un Price
 * NUEVO (RB-VENTA-007): sin él, subir la cuota devolvería el precio viejo desde
 * la caché de idempotencia de Stripe y el gimnasio seguiría cobrando de menos.
 */
export function priceKey(orgId: string, planId: string, unitAmountCents: number, recurring: boolean) {
  return idempotencyKey("price", orgId, [planId, String(unitAmountCents), recurring ? "rec" : "one"]);
}

/** `customer:<orgId>:<memberId>:v1` */
export function customerKey(orgId: string, memberId: string) {
  return idempotencyKey("customer", orgId, memberId);
}

/** `checkout:<orgId>:<memberId>_<planId>_<ventana>:v1` */
export function memberCheckoutKey(orgId: string, memberId: string, planId: string, at?: Date) {
  return idempotencyKey("checkout", orgId, [memberId, planId, checkoutWindow(at)]);
}

/** `checkout:<orgId>:<email>_<planId>_<ventana>:v1` — el prospecto aún no tiene id. */
export function prospectCheckoutKey(orgId: string, email: string, planId: string, at?: Date) {
  return idempotencyKey("checkout", orgId, [email.trim().toLowerCase(), planId, checkoutWindow(at)]);
}

/**
 * Plano 1: la organización es el "tenant" de la operación, pero el recurso vive
 * en la cuenta de Apta — de ahí `platform` en el hueco de `orgId`.
 */
export function platformCustomerKey(orgId: string) {
  return idempotencyKey("customer", "platform", orgId);
}

export function platformCheckoutKey(orgId: string, planCode: string, at?: Date) {
  return idempotencyKey("checkout", "platform", [orgId, planCode, checkoutWindow(at)]);
}

/**
 * HU-ST-20 · `refund:<orgId>:<paymentId>_<importe>_<yaDevuelto>:v1`
 *
 * El escenario que esta clave tiene que ganar es el "doble clic": dirección
 * pulsa "Devolver" dos veces y Stripe recibe dos peticiones idénticas. Con la
 * misma clave, la segunda devuelve el MISMO refund en vez de emitir otro, y el
 * socio recibe su dinero una vez.
 *
 * `yaDevuelto` —lo que el `Payment` tenía devuelto ANTES de esta operación—
 * está en la clave por un motivo concreto, y no es decorativo: sin él, dos
 * devoluciones parciales LEGÍTIMAS del mismo importe sobre el mismo cobro
 * (dos veces 10 € de un bono de 60 €, con días de diferencia pero dentro de
 * las 24 h que Stripe guarda la clave) compartirían clave y la segunda se
 * perdería en silencio. Con él, el doble clic sigue colisionando —los dos
 * clics leen el mismo `yaDevuelto`, porque el primero aún no ha escrito— y las
 * dos devoluciones de verdad no.
 */
export function refundKey(orgId: string, paymentId: string, amountCents: number, alreadyRefundedCents = 0) {
  return idempotencyKey("refund", orgId, [paymentId, String(amountCents), String(alreadyRefundedCents)]);
}

/**
 * HU-ST-20 · `credit_note:<orgId>:<invoiceId>_<importe>_<yaDevuelto>:v1`
 *
 * Misma lógica que `refundKey`, para la devolución que va contra una factura de
 * suscripción: ahí lo que se crea es una nota de crédito (que a su vez emite el
 * refund), así que el recurso y el identificador estable son otros.
 */
export function creditNoteKey(orgId: string, invoiceId: string, amountCents: number, alreadyRefundedCents = 0) {
  return idempotencyKey("credit_note", orgId, [invoiceId, String(amountCents), String(alreadyRefundedCents)]);
}

/**
 * `invoicepay:<orgId>:<invoiceId>_<ventana>:v1` — HU-ST-19, "Pagar ahora".
 *
 * La ventana de 10 minutos está aquí por la misma razón que en los checkouts,
 * y además por una propia: un socio que actualiza su tarjeta y vuelve a
 * intentarlo TIENE que poder hacerlo. Con una clave fija, Stripe le devolvería
 * la respuesta cacheada del intento que falló con la tarjeta vieja y la
 * pantalla le diría que sigue sin poder cobrarse.
 */
export function invoicePayKey(orgId: string, invoiceId: string, at?: Date) {
  return idempotencyKey("invoicepay", orgId, [invoiceId, checkoutWindow(at)]);
}

/**
 * HU-ST-27 · `coupon:<orgId>:<código>:v1` y `promocode:<orgId>:<código>:v1`.
 *
 * La entidad es el CÓDIGO ("VERANO25"), no un identificador de fila: cuando se
 * crea el cupón todavía no hay fila local, y el código es lo único estable que
 * identifica esa creación desde cualquier proceso. Sin ventana temporal a
 * propósito —a diferencia de los checkouts—: dar de alta dos veces "VERANO25"
 * nunca es una venta nueva, es un doble clic o un reintento de red, y el
 * segundo intento tiene que devolver el MISMO cupón media hora después
 * igualmente.
 *
 * Las dos claves van separadas porque son dos objetos de Stripe: si el
 * `PromotionCode` falla tras crearse el `Coupon`, el reintento recupera el
 * mismo `Coupon` en vez de crear un segundo descuento idéntico.
 */
export function couponKey(orgId: string, code: string) {
  return idempotencyKey("coupon", orgId, code);
}

export function promotionCodeKey(orgId: string, code: string) {
  return idempotencyKey("promocode", orgId, code);
}
