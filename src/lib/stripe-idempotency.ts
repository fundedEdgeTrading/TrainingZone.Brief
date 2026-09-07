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

