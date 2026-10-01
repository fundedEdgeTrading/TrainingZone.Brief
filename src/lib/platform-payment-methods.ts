import { getStripeClient } from "@/lib/stripe";

/**
 * Nombre estable de la Payment Method Configuration de Stripe (cuenta de
 * Apta) que excluye Apple Pay del checkout de la licencia. Se crea UNA VEZ
 * desde el Dashboard de Stripe (Settings → Payment methods → "+ Nueva
 * configuración", desactivar solo Apple Pay y dejar el resto activo, con
 * este nombre exacto) — igual que el `lookup_key` de los precios
 * (`platform-price-catalog.ts`): no se copia ningún id a variables de
 * entorno, el código lo localiza por nombre.
 *
 * Motivo: pagando con Apple Pay y "Ocultar mi correo" activado, Apple entrega
 * un alias `@privaterelay.appleid.com` como email del comprador. Stripe lo
 * valida como email correcto — el checkout no falla — pero Apta se queda sin
 * forma de contactar al director si el reenvío de Apple no queda bien
 * enlazado. Se aplica solo aquí, al checkout de la LICENCIA de Apta (cuenta
 * propia): los bonos de socio (`member-billing.ts`, cuenta conectada de cada
 * gimnasio) siguen ofreciendo Apple Pay sin cambios (HU-ST-09/D-S2).
 */
const NO_APPLE_PAY_CONFIG_NAME = "apta_licencia_sin_apple_pay";

/**
 * `null` si Stripe no está configurado, si todavía no existe esa
 * configuración en el Dashboard, o si Stripe falla al listarlas: el checkout
 * no se bloquea por esto, sigue ofreciendo Apple Pay hasta que exista.
 */
export async function resolveNoApplePayConfigId(): Promise<string | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;
  try {
    const { data } = await stripe.paymentMethodConfigurations.list({ limit: 100 });
    return data.find((config) => config.name === NO_APPLE_PAY_CONFIG_NAME)?.id ?? null;
  } catch (error) {
    console.error("[platform-payment-methods] no se pudo leer la payment method configuration:", error);
    return null;
  }
}
