import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { deauthorizeStripeAccount } from "@/lib/stripe-connect";
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
