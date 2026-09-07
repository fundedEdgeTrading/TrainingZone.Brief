import Stripe from "stripe";

/**
 * HU-ST-03 / RB-PAGO-021 · La versión de API de Stripe se fija en el código,
 * no se hereda del SDK.
 *
 * `new Stripe(key)` usa la versión que traiga el paquete instalado, declarado
 * como `^22.3.2`: un `npm update` puede cambiar la versión de API bajo los pies
 * sin que nadie toque una línea de código. Es exactamente el mecanismo que
 * produjo BUG-1 — `Invoice.subscription` desapareció y el plano 1 dejó de
 * conciliar en silencio.
 *
 * Cambiar esta constante es una decisión deliberada: hay que releer el changelog
 * de la versión destino y comprobar los shapes que leemos (`stripe-invoice.ts`).
 */
export const PINNED_STRIPE_API_VERSION = "2026-07-29.dahlia";

/** Versión que declara el SDK instalado. Se compara con la fijada al arrancar. */
export const SDK_STRIPE_API_VERSION: string = Stripe.API_VERSION;

/**
 * Opciones con las que se construye TODO cliente de Stripe del sistema.
 *
 * El `as` es deliberado: el SDK tipa `apiVersion` como su propia constante, así
 * que sin él una actualización del paquete rompería la compilación en vez de
 * avisar. La historia pide lo contrario — que el desajuste **avise por log sin
 * impedir el arranque** — porque una API pinneada a una versión anterior es un
 * escenario soportado por Stripe, no un error.
 */
export function stripeClientOptions(): Stripe.StripeConfig {
  return { apiVersion: PINNED_STRIPE_API_VERSION as Stripe.LatestApiVersion };
}

/**
 * Aviso de desajuste, o `null` si SDK y versión fijada coinciden. Puro para
 * poder probarlo; quien decide si lo imprime es `warnOnStripeApiVersionDrift`.
 */
export function stripeApiVersionDrift(sdkVersion: string = SDK_STRIPE_API_VERSION): string | null {
  if (sdkVersion === PINNED_STRIPE_API_VERSION) return null;
  return (
    `[stripe] El SDK instalado declara la API ${sdkVersion} y el código fija ${PINNED_STRIPE_API_VERSION}. ` +
    "Se seguirá llamando con la versión fijada. Revisa el changelog de Stripe y actualiza " +
    "PINNED_STRIPE_API_VERSION en src/lib/stripe-api-version.ts cuando compruebes que los shapes que leemos siguen valiendo."
  );
}

let warned = false;

/** Un aviso por proceso: esto se llama en cada construcción del cliente. */
export function warnOnStripeApiVersionDrift(): void {
  if (warned) return;
  warned = true;
  const drift = stripeApiVersionDrift();
  if (drift) console.warn(drift);
}
