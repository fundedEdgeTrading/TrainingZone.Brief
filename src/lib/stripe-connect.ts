import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

/**
 * C.3: "Conectar con Stripe" — Connect Standard, OAuth de un botón.
 * RB-CONNECT-001: Apta guarda solo `acct_...`, nunca una clave secreta ni un
 * webhook secret del gimnasio.
 */
function appBaseUrl() {
  return (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function isStripeConnectConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_CONNECT_CLIENT_ID;
}

/** `state` = orgId, para atar el callback a la org que inició el OAuth. */
export function buildConnectOAuthUrl(orgId: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
    scope: "read_write",
    redirect_uri: `${appBaseUrl()}/api/stripe/connect/callback`,
    state: orgId,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeOAuthCode(
  code: string
): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const stripe = getStripeClient();
  if (!stripe) return { ok: false, error: "Stripe no está configurado en este entorno." };

  try {
    const response = await stripe.oauth.token({ grant_type: "authorization_code", code });
    const accountId = response.stripe_user_id;
    if (!accountId) return { ok: false, error: "Stripe no devolvió una cuenta conectada." };
    return { ok: true, accountId };
  } catch {
    return { ok: false, error: "No se pudo intercambiar el código de Stripe (código inválido o caducado)." };
  }
}

/** Guarda/actualiza la cuenta conectada de una org y refresca su estado de onboarding. */
export async function upsertStripeAccountForOrg(orgId: string, accountId: string) {
  const stripe = getStripeClient();
  if (!stripe) throw new Error("Stripe no está configurado en este entorno.");

  const account = await stripe.accounts.retrieve(accountId);

  await prisma.stripeAccount.upsert({
    where: { orgId },
    create: {
      orgId,
      accountId,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
    },
    update: {
      accountId,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
    },
  });
}

/** Refresca chargesEnabled/payoutsEnabled a partir de un `event.account` de webhook. */
export async function refreshStripeAccountStatus(accountId: string) {
  const stripe = getStripeClient();
  if (!stripe) return;

  const existing = await prisma.stripeAccount.findUnique({ where: { accountId } });
  if (!existing) return;

  const account = await stripe.accounts.retrieve(accountId);
  await prisma.stripeAccount.update({
    where: { accountId },
    data: { chargesEnabled: !!account.charges_enabled, payoutsEnabled: !!account.payouts_enabled },
  });
}
