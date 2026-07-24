import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

/**
 * F12/RB-PAGO-001 + Parte C (Connect). Sin cuenta Stripe real en este entorno
 * de demo: el cliente se inicializa solo si hay clave configurada, y toda
 * acción que lo necesite falla con un mensaje claro en vez de reventar.
 *
 * §0/RB-CONNECT-001: hay UNA SOLA clave secreta en todo el sistema — la de
 * Apta (`STRIPE_SECRET_KEY`). Los cobros a socios se hacen con esa misma
 * clave más la cabecera `Stripe-Account: acct_...` de la cuenta conectada del
 * gimnasio (Connect Standard). Ningún gimnasio introduce jamás una clave.
 */
let stripeClient: Stripe | null = null;

/** Cliente de plataforma (Apta): úsalo para cobrar la licencia SaaS (Parte A) y para operaciones Connect (OAuth, `stripeAccount.retrieve`). */
export function getStripeClient(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

/** Alias explícito de `getStripeClient` para los call sites del Plano 1 (cobro de plataforma). */
export function isPlatformStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Cliente resuelto para el Plano 2 (gimnasio → socios, Parte C): misma clave
 * de Apta + `Stripe-Account` de la cuenta conectada de esa org. Falla con un
 * motivo explícito si la org no conectó Stripe o no completó el onboarding
 * (`chargesEnabled`), para que el call site degrade con RB-CONNECT-002.
 */
export async function stripeForOrg(
  orgId: string
): Promise<{ ok: true; stripe: Stripe; accountId: string } | { ok: false; error: string }> {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "Stripe no está configurado en este entorno (falta STRIPE_SECRET_KEY)." };

  const account = await prisma.stripeAccount.findUnique({ where: { orgId } });
  if (!account) return { ok: false, error: "Este gimnasio aún no ha conectado su cuenta de Stripe." };
  if (!account.chargesEnabled) return { ok: false, error: "La cuenta de Stripe de este gimnasio aún no puede cobrar (onboarding incompleto)." };

  return { ok: true, stripe, accountId: account.accountId };
}

/** RB-CONNECT-002: gating de UI — ¿puede este gimnasio cobrar a socios hoy? */
export async function isStripeConfiguredForOrg(orgId: string) {
  if (!isPlatformStripeConfigured()) return false;
  const account = await prisma.stripeAccount.findUnique({ where: { orgId }, select: { chargesEnabled: true } });
  return !!account?.chargesEnabled;
}
