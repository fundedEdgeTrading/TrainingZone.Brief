import Stripe from "stripe";

/**
 * F12/RB-PAGO-001. Sin cuenta Stripe real en este entorno de demo: el cliente
 * se inicializa solo si hay clave configurada, y toda acción que lo necesite
 * falla con un mensaje claro en vez de reventar. En producción, con
 * STRIPE_SECRET_KEY configurada, el checkout/webhook quedan operativos tal cual.
 */
let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}
