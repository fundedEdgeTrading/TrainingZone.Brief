import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { publicOrigin } from "@/lib/site";

/**
 * C.3: "Conectar con Stripe" — Connect Standard, OAuth de un botón.
 * RB-CONNECT-001: Apta guarda solo `acct_...`, nunca una clave secreta ni un
 * webhook secret del gimnasio.
 */
export function isStripeConnectConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_CONNECT_CLIENT_ID;
}

/** `state` = orgId, para atar el callback a la org que inició el OAuth. */
export function buildConnectOAuthUrl(orgId: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
    scope: "read_write",
    redirect_uri: `${publicOrigin()}/api/stripe/connect/callback`,
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

/**
 * HU-ST-06 / RB-CONNECT-004 · El gimnasio ha revocado el acceso de Apta desde su
 * propio Dashboard de Stripe (`account.application.deauthorized`).
 *
 * Se apagan `chargesEnabled` y `payoutsEnabled`, que es lo que gatea toda la UI
 * de cobro (`isStripeConfiguredForOrg`, la tarjeta "Cobros a socios" de
 * /organization): el gimnasio vuelve a ver "Conectar cobros con Stripe" en vez
 * de un botón de cobro que fallaría con un 401 de Stripe.
 *
 * Lo que NO se hace, a propósito: no se borra el `acct_…` ni el espejo de
 * precios de `MembershipPlan` (`stripeProductId`/`stripePriceId`/
 * `stripeAccountId`). Un gimnasio que reconecta LA MISMA cuenta —el caso
 * habitual: revocó por error, o rehízo el permiso— recupera su catálogo y sus
 * suscripciones vivas tal cual. Borrarlo dejaría huérfanos en Stripe cobros que
 * siguen ejecutándose, y obligaría a recrear productos y precios que ya existen.
 * Si reconecta OTRA cuenta, `ensureStripePrice` ya detecta el cambio por
 * `stripeAccountId` y rehace el espejo.
 *
 * Cuenta desconocida (evento de otra plataforma reenviado, cuenta ya purgada):
 * se descarta sin escribir nada.
 */
export async function deauthorizeStripeAccount(accountId: string | null | undefined): Promise<void> {
  if (!accountId) return;

  const existing = await prisma.stripeAccount.findUnique({
    where: { accountId },
    select: { id: true },
  });
  if (!existing) return;

  await prisma.stripeAccount.update({
    where: { accountId },
    data: { chargesEnabled: false, payoutsEnabled: false },
  });
}
