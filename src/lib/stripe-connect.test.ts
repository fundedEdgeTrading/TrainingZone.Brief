import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  buildConnectOAuthUrl,
  buildStripeAuthorizeUrl,
  CONNECT_STATE_TTL_SECONDS,
  connectStateCookieOptions,
  createConnectState,
  deauthorizeStripeAccount,
  verifyConnectState,
} from "@/lib/stripe-connect";
import { isStripeConfiguredForOrg } from "@/lib/stripe";

/**
 * HU-ST-06 · Un gimnasio puede revocar el acceso de Apta desde su propio
 * Dashboard de Stripe. Hasta ahora no pasaba nada: la UI seguía ofreciendo
 * cobrar y el botón fallaba con un 401 de Stripe delante del socio.
 *
 * Lo que se prueba: se apagan los interruptores que gatean la UI, y NO se borra
 * ni la cuenta ni el espejo de precios — un gimnasio que reconecta la misma
 * cuenta recupera su catálogo y sus suscripciones vivas.
 */

const SLUG = "e2e-connect-deauth-test";

async function crearOrgConectada(tag: string) {
  const org = await prisma.organization.create({ data: { name: `Connect ${tag}`, slug: `${SLUG}-${tag}` } });
  const accountId = `acct_${SLUG}-${tag}`;
  await prisma.stripeAccount.create({
    data: { orgId: org.id, accountId, chargesEnabled: true, payoutsEnabled: true },
  });
  const plan = await prisma.membershipPlan.create({
    data: {
      orgId: org.id,
      name: "Bono 10",
      type: "SESSION_PACK",
      priceCents: 8900,
      stripeProductId: `prod_${tag}`,
      stripePriceId: `price_${tag}`,
      stripeAccountId: accountId,
    },
  });
  return { orgId: org.id, accountId, planId: plan.id };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.stripeAccount.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("una desconexión apaga el cobro y devuelve la UI a 'conecta tu Stripe'", async () => {
  const { orgId, accountId, planId } = await crearOrgConectada("revocada");

  await deauthorizeStripeAccount(accountId);

  const cuenta = await prisma.stripeAccount.findUniqueOrThrow({ where: { accountId } });
  assert.equal(cuenta.chargesEnabled, false);
  assert.equal(cuenta.payoutsEnabled, false);

  // `isStripeConfiguredForOrg` es lo que gatea la tarjeta de cobros y el botón
  // de checkout: con la cuenta revocada tiene que decir que no.
  assert.equal(await isStripeConfiguredForOrg(orgId), false);

  // El histórico queda intacto: ni se borra el acct_, ni el espejo de precios.
  assert.equal(cuenta.accountId, accountId);
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: planId } });
  assert.equal(plan.stripeProductId, "prod_revocada");
  assert.equal(plan.stripePriceId, "price_revocada");
  assert.equal(plan.stripeAccountId, accountId);
});

test("una cuenta que no conocemos se descarta sin escribir nada", async () => {
  const { accountId } = await crearOrgConectada("conocida");

  await deauthorizeStripeAccount("acct_de_otra_plataforma");
  await deauthorizeStripeAccount(null);

  const cuenta = await prisma.stripeAccount.findUniqueOrThrow({ where: { accountId } });
  assert.equal(cuenta.chargesEnabled, true, "la cuenta que sí conocemos no puede verse afectada");
});

test("la desconexión es idempotente", async () => {
  const { accountId } = await crearOrgConectada("repetida");

  await deauthorizeStripeAccount(accountId);
  await deauthorizeStripeAccount(accountId);

  const cuenta = await prisma.stripeAccount.findUniqueOrThrow({ where: { accountId } });
  assert.equal(cuenta.chargesEnabled, false);
});

/**
 * CON-01 · `state = orgId` no es un nonce: el callback aceptaba cualquier
 * `code` que llegara con el orgId de la víctima, y el atacante podía atar la
 * org de la víctima a SU cuenta de Stripe (CSRF de OAuth).
 */

test("CON-01: el state que va a Stripe no es el orgId ni se puede predecir", () => {
  const a = createConnectState("org_victima");
  const b = createConnectState("org_victima");
  assert.notEqual(a.nonce, "org_victima");
  assert.notEqual(a.nonce, b.nonce, "cada inicio de OAuth lleva un nonce nuevo");
  assert.ok(a.nonce.length >= 43, "32 bytes aleatorios en base64url");

  const url = new URL(buildStripeAuthorizeUrl(a.nonce));
  assert.equal(url.searchParams.get("state"), a.nonce);
  assert.ok(!url.toString().includes("org_victima"));
  // El botón ya no enlaza a Stripe con el orgId: pasa por /start, que pone la cookie.
  assert.equal(buildConnectOAuthUrl("org_victima"), "/api/stripe/connect/start");
});

test("CON-01: el callback con state = orgId (el ataque de antes) se rechaza", () => {
  // Sin cookie: el navegador de la víctima nunca inició el flujo.
  assert.deepEqual(verifyConnectState(undefined, "org_victima", "org_victima"), { ok: false, error: "missing" });
  // Con la cookie de un flujo legítimo suyo, pero el state del atacante.
  const { cookieValue } = createConnectState("org_victima");
  assert.deepEqual(verifyConnectState(cookieValue, "org_victima", "org_victima"), { ok: false, error: "state-mismatch" });
});

test("CON-01: nonce y org de la cookie deben casar con el state y con la sesión", () => {
  const { nonce, cookieValue } = createConnectState("org_a");
  assert.deepEqual(verifyConnectState(cookieValue, nonce, "org_a"), { ok: true });
  assert.deepEqual(verifyConnectState(cookieValue, nonce, "org_b"), { ok: false, error: "org-mismatch" });
});

test("CON-01: la cookie caduca a los 10 minutos", () => {
  const t0 = Date.UTC(2026, 8, 23, 10, 0, 0);
  const { nonce, cookieValue } = createConnectState("org_a", t0);
  assert.deepEqual(verifyConnectState(cookieValue, nonce, "org_a", t0 + 9 * 60_000), { ok: true });
  assert.deepEqual(verifyConnectState(cookieValue, nonce, "org_a", t0 + 11 * 60_000), { ok: false, error: "expired" });
});

test("CON-01: una cookie manipulada (otra org, otra caducidad) no pasa la firma", () => {
  const { nonce, cookieValue } = createConnectState("org_a");
  const [payloadB64, mac] = cookieValue.split(".");
  const payload = Buffer.from(payloadB64, "base64url").toString("utf8").replace("org_a", "org_b");
  const forged = `${Buffer.from(payload, "utf8").toString("base64url")}.${mac}`;
  assert.deepEqual(verifyConnectState(forged, nonce, "org_b"), { ok: false, error: "invalid" });
  assert.deepEqual(verifyConnectState("basura", nonce, "org_a"), { ok: false, error: "invalid" });
});

test("CON-01: la cookie es httpOnly, Secure, SameSite=Lax y de 10 minutos", () => {
  const opts = connectStateCookieOptions();
  assert.equal(opts.httpOnly, true);
  assert.equal(opts.secure, true);
  assert.equal(opts.sameSite, "lax");
  assert.equal(opts.maxAge, CONNECT_STATE_TTL_SECONDS);
  assert.equal(CONNECT_STATE_TTL_SECONDS, 600);
});
