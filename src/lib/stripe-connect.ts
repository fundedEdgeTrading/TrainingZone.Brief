import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { publicOrigin } from "@/lib/site";
import {
  buildConnectStatus,
  missingConnectEnvVars,
  type ConnectStatus,
} from "@/lib/stripe-connect-status";

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

/**
 * HU-ST-07 · Estado completo de la conexión de un gimnasio, para pintar la
 * tarjeta "Cobros a socios" sin que quede un botón muerto en ninguno de los
 * cuatro casos posibles.
 *
 * Lee en vivo de Stripe (`accounts.retrieve` + el próximo payout) porque
 * `StripeAccount` solo guarda los dos interruptores: los requisitos pendientes
 * cambian solos según el gimnasio va subiendo papeles, y una copia local
 * mentiría a las pocas horas. Si Stripe no responde se devuelve `unavailable` y
 * la tarjeta degrada con su mensaje, en vez de tumbar /organization entera.
 */
export async function getConnectStatus(orgId: string): Promise<ConnectStatus> {
  const missing = missingConnectEnvVars();
  const account = await prisma.stripeAccount.findUnique({
    where: { orgId },
    select: { accountId: true, chargesEnabled: true, payoutsEnabled: true },
  });

  // El orden importa: un gimnasio YA conectado en un entorno al que le falta la
  // clave merece saber que el problema es del entorno, no de su cuenta.
  if (missing.length > 0) return { state: "not-configured", missing };
  if (!account) return { state: "not-connected" };

  const stripe = getStripeClient();
  if (!stripe) return { state: "not-configured", missing: ["STRIPE_SECRET_KEY"] };

  try {
    const remote = await stripe.accounts.retrieve(account.accountId);

    // El próximo payout solo tiene sentido preguntarlo si Stripe ya paga: en una
    // cuenta sin payouts la llamada devolvería siempre vacío.
    let nextPayoutArrival: number | null = null;
    let nextPayoutCents: number | null = null;
    if (remote.payouts_enabled) {
      const payouts = await stripe.payouts.list(
        { limit: 1, status: "pending" },
        { stripeAccount: account.accountId }
      );
      const next = payouts.data[0];
      if (next) {
        nextPayoutArrival = next.arrival_date;
        nextPayoutCents = next.amount;
      }
    }

    // De paso se refresca el espejo local: es la lectura más fresca que vamos a
    // tener, y `account.updated` puede haberse perdido.
    if (remote.charges_enabled !== account.chargesEnabled || remote.payouts_enabled !== account.payoutsEnabled) {
      await prisma.stripeAccount.update({
        where: { orgId },
        data: { chargesEnabled: !!remote.charges_enabled, payoutsEnabled: !!remote.payouts_enabled },
      });
    }

    return buildConnectStatus({
      accountId: account.accountId,
      chargesEnabled: !!remote.charges_enabled,
      payoutsEnabled: !!remote.payouts_enabled,
      currentlyDue: remote.requirements?.currently_due ?? [],
      disabledReason: remote.requirements?.disabled_reason ?? null,
      nextPayoutArrival,
      nextPayoutCents,
    });
  } catch (error) {
    console.error("[stripe-connect] no se pudo leer el estado de la cuenta conectada", error);
    return {
      state: "unavailable",
      accountId: account.accountId,
      error: "No hemos podido consultar el estado de tu cuenta de Stripe ahora mismo.",
    };
  }
}
