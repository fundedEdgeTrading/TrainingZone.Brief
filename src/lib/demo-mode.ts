/**
 * PROD-01 · Modo demo EXPLÍCITO.
 *
 * Antes, "falta `STRIPE_SECRET_KEY`" equivalía a "modo demo". En producción eso
 * convertía un olvido de configuración en una puerta abierta: `/demo-checkout`
 * daba de alta organizaciones sin pagar, `/demo-checkout/socio` regalaba bonos
 * y el login enseñaba los usuarios sembrados con su contraseña. Un secreto
 * ausente nunca debe traducirse en "más funcionalidad".
 *
 * Ahora el modo demo se pide con `DEMO_MODE="true"`, y en producción además
 * con `ALLOW_DEMO_IN_PRODUCTION="true"` (el despliegue de demostración y el CI,
 * que corre `next start`). Por defecto, apagado.
 *
 * Módulo puro —sin Prisma, sin Stripe, sin `next/*`— para poder probarlo con
 * `tsx --test` sin base de datos.
 */
export type DemoModeEnv = {
  DEMO_MODE?: string;
  ALLOW_DEMO_IN_PRODUCTION?: string;
  NODE_ENV?: string;
};

export function isDemoModeActive(env: DemoModeEnv = process.env): boolean {
  if (env.DEMO_MODE !== "true") return false;
  if (env.NODE_ENV !== "production") return true;
  return env.ALLOW_DEMO_IN_PRODUCTION === "true";
}
