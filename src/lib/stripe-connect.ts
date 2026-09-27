import crypto from "crypto";
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

/**
 * CON-01 · El `state` del OAuth era el `orgId`: un valor predecible y fijo, así
 * que no protegía de nada. Un atacante empezaba el OAuth con SU cuenta de
 * Stripe, se quedaba con el `code` y le hacía abrir a la víctima (dirección de
 * otro gimnasio, con sesión) `/callback?code=…&state=<orgId de la víctima>`:
 * la org de la víctima quedaba conectada a la cuenta del atacante y los cobros
 * a sus socios acababan en ella.
 *
 * Ahora `state` es un nonce aleatorio de un solo uso que solo conoce el
 * navegador que inició el flujo: viaja en una cookie httpOnly firmada con
 * `AUTH_SECRET`, junto a la org que lo inició y su caducidad. El callback exige
 * que el `state` de la URL coincida con el de la cookie, que la org de la
 * cookie sea la de la sesión, y la borra pase lo que pase.
 *
 * Es una cookie técnica (existe solo para completar la conexión que el propio
 * usuario ha pedido) y está inventariada en `/cookies`.
 */
export const CONNECT_STATE_COOKIE = "tz_stripe_connect";

/** 10 minutos: de sobra para el formulario de Stripe, poco para reutilizarla. */
export const CONNECT_STATE_TTL_SECONDS = 10 * 60;

/** El propósito va dentro de la firma: este token no vale como ningún otro. */
const CONNECT_STATE_PURPOSE = "stripe-connect-state";

/** Punto de entrada del botón "Conectar cobros con Stripe": pone la cookie y redirige a Stripe. */
export const CONNECT_START_PATH = "/api/stripe/connect/start";

function connectStateSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no configurado — necesario para firmar el estado del OAuth de Stripe.");
  return s;
}

function signConnectState(payload: string): string {
  return crypto.createHmac("sha256", connectStateSecret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  return aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
}

/** Opciones de la cookie. `path` acotado: solo la ven las rutas de la conexión. */
export function connectStateCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/api/stripe/connect",
    maxAge: CONNECT_STATE_TTL_SECONDS,
  };
}

/**
 * Nonce nuevo para `orgId`. `nonce` va como `state` a Stripe; `cookieValue`, a
 * la cookie. 32 bytes de `randomBytes`: inadivinable, a diferencia del orgId.
 */
export function createConnectState(orgId: string, now: number = Date.now()): { nonce: string; cookieValue: string } {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const exp = now + CONNECT_STATE_TTL_SECONDS * 1000;
  const payload = [CONNECT_STATE_PURPOSE, nonce, orgId, String(exp)].join(".");
  return { nonce, cookieValue: `${Buffer.from(payload, "utf8").toString("base64url")}.${signConnectState(payload)}` };
}

export type ConnectStateCheck = { ok: true } | { ok: false; error: "missing" | "invalid" | "expired" | "state-mismatch" | "org-mismatch" };

/**
 * ¿El `state` que devuelve Stripe lo inició ESTE navegador para ESTA org?
 * `sessionOrgId` sale de la sesión, nunca de la URL.
 */
export function verifyConnectState(
  cookieValue: string | null | undefined,
  state: string | null | undefined,
  sessionOrgId: string,
  now: number = Date.now()
): ConnectStateCheck {
  if (!cookieValue || !state) return { ok: false, error: "missing" };

  const [payloadB64, mac, ...rest] = cookieValue.split(".");
  if (!payloadB64 || !mac || rest.length > 0) return { ok: false, error: "invalid" };

  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  if (!safeEqual(mac, signConnectState(payload))) return { ok: false, error: "invalid" };

  const [purpose, nonce, orgId, expStr, ...extra] = payload.split(".");
  const exp = Number(expStr);
  if (purpose !== CONNECT_STATE_PURPOSE || !nonce || !orgId || !Number.isFinite(exp) || extra.length > 0) {
    return { ok: false, error: "invalid" };
  }
  if (now > exp) return { ok: false, error: "expired" };
  if (!safeEqual(nonce, state)) return { ok: false, error: "state-mismatch" };
  if (orgId !== sessionOrgId) return { ok: false, error: "org-mismatch" };
  return { ok: true };
}

/**
 * Pantalla con la que abre Stripe el OAuth. Sin `stripe_landing`, Stripe
 * muestra el alta de una cuenta nueva y el director que YA tiene Stripe cree
 * que tiene que crear su empresa desde cero. Por eso la tarjeta ofrece las dos
 * puertas: "ya tengo cuenta" (login) y "crear cuenta" (register).
 */
export type ConnectLanding = "login" | "register";

/** Lee el `landing` de la query del botón; cualquier otro valor cae en el alta, que es lo que hace Stripe por defecto. */
export function parseConnectLanding(value: string | null | undefined): ConnectLanding {
  return value === "login" ? "login" : "register";
}

/**
 * Datos del centro con los que Stripe rellena de antemano el alta de la
 * cuenta. Solo sugieren: el director los revisa y los cambia en Stripe, y a
 * Apta no vuelve nada de ahí salvo el `acct_...`.
 */
export type ConnectPrefill = {
  email?: string | null;
  businessName?: string | null;
};

/** País por defecto del alta: Apta factura en euros a centros de España. */
const CONNECT_PREFILL_COUNTRY = "ES";

/** URL de autorización de Stripe con el nonce como `state` (nunca el orgId). */
export function buildStripeAuthorizeUrl(
  nonce: string,
  { landing = "register", prefill = {} }: { landing?: ConnectLanding; prefill?: ConnectPrefill } = {}
) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.STRIPE_CONNECT_CLIENT_ID ?? "",
    scope: "read_write",
    redirect_uri: `${publicOrigin()}/api/stripe/connect/callback`,
    state: nonce,
    stripe_landing: landing,
  });
  const email = prefill.email?.trim();
  const businessName = prefill.businessName?.trim();
  if (email) params.set("stripe_user[email]", email);
  if (businessName) params.set("stripe_user[business_name]", businessName);
  params.set("stripe_user[country]", CONNECT_PREFILL_COUNTRY);
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

/**
 * Enlace del botón "Conectar cobros con Stripe". Ya no apunta a Stripe: apunta
 * a `/api/stripe/connect/start`, que es quien puede poner la cookie del nonce
 * (un Server Component no puede escribir cookies). La org sale de la sesión en
 * el servidor, así que el argumento se ignora; se mantiene para no romper a
 * quien ya lo llama. `landing` elige la pantalla con la que abre Stripe.
 */
export function buildConnectOAuthUrl(orgId?: string, landing?: ConnectLanding) {
  void orgId;
  return landing ? `${CONNECT_START_PATH}?landing=${landing}` : CONNECT_START_PATH;
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
