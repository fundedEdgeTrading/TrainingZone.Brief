import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  cardLabel,
  countMembersWithExpiringCard,
  expiryLabel,
  hasExpiringCard,
  reconcileCardExpiry,
} from "@/lib/stripe-card-expiry";

/**
 * HU-ST-22 · Tarjetas por caducar.
 *
 * El aviso y su retirada son las dos caras de lo mismo, y la que se olvida es
 * siempre la segunda: si la red renueva la tarjeta sola y el aviso se queda
 * puesto, dirección persigue a un socio cuyo cobro va a entrar sin problema.
 * Por eso el estado no es una marca que se pone, sino el ÚLTIMO apunte de cada
 * socio — y así da igual en qué orden lleguen los dos eventos.
 */

const SUFFIX = "e2e-caducidad-test";

type Fixture = { orgId: string; memberId: string; centerId: string; stripeCustomerId: string };

async function createFixture(tag: string): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Caducidad ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const stripeCustomerId = `cus_${slug}`;
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: `Caducidad ${tag}`,
      email: `${slug}@example.com`,
      stripeCustomerId,
    },
  });
  return { orgId: org.id, memberId: member.id, centerId: center.id, stripeCustomerId };
}

/** `customer.source.expiring`: una `Card` con los campos en la raíz. */
function expiringEvent(customerId: string): Stripe.Event {
  return {
    type: "customer.source.expiring",
    data: {
      object: { id: "card_tz_1", object: "card", customer: customerId, brand: "Visa", last4: "4242", exp_month: 10, exp_year: 2026 },
    },
  } as unknown as Stripe.Event;
}

/** `payment_method.automatically_updated`: un `PaymentMethod` con todo dentro de `card`. */
function updatedEvent(customerId: string): Stripe.Event {
  return {
    type: "payment_method.automatically_updated",
    data: {
      object: { id: "pm_tz_1", object: "payment_method", customer: customerId, card: { brand: "visa", last4: "4242", exp_month: 10, exp_year: 2029 } },
    },
  } as unknown as Stripe.Event;
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("la tarjeta se nombra sin enseñar el número, y la caducidad como la lee el socio", () => {
  assert.equal(cardLabel({ brand: "Visa", last4: "4242" }), "VISA ···· 4242");
  assert.equal(cardLabel({ brand: null, last4: null }), "Tarjeta");
  assert.equal(expiryLabel(10, 2026), "10/2026");
  assert.equal(expiryLabel(null, 2026), null);
});

test("una tarjeta que caduca avisa al socio una sola vez y aparece en el panel", async () => {
  const f = await createFixture("aviso");

  const result = await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));
  assert.equal(result.ok, true);

  assert.equal(await hasExpiringCard(f.memberId), true);
  assert.equal(await countMembersWithExpiringCard(f.orgId), 1, "dirección lo ve en su panel");

  const avisos = await prisma.auditLog.count({
    where: { orgId: f.orgId, entityType: "CardExpiryNotice" },
  });
  assert.equal(avisos, 1, "el socio recibe el aviso con su enlace");

  // Reentrega del mismo evento: Stripe entrega al menos una vez.
  await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));
  assert.equal(
    await prisma.auditLog.count({ where: { orgId: f.orgId, entityType: "CardExpiryNotice" } }),
    1,
    "un aviso por caducidad, no uno por entrega"
  );
  assert.equal(await countMembersWithExpiringCard(f.orgId), 1, "y sigue contando como UN socio, no dos");
});

test("cuando la red actualiza la tarjeta sola, el aviso deja de aparecer", async () => {
  const f = await createFixture("actualizada");

  await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));
  assert.equal(await countMembersWithExpiringCard(f.orgId), 1);

  // Visa/Mastercard Account Updater ha refrescado la tarjeta: el cobro del mes
  // que viene va a entrar sin que nadie haga nada.
  await reconcileCardExpiry(f.orgId, updatedEvent(f.stripeCustomerId));

  assert.equal(await hasExpiringCard(f.memberId), false);
  assert.equal(await countMembersWithExpiringCard(f.orgId), 0, "perseguir a este socio sería perder el tiempo");
});

test("el estado es el ÚLTIMO apunte: si la tarjeta vuelve a caducar, vuelve a avisar", async () => {
  const f = await createFixture("reincidente");

  await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));
  await reconcileCardExpiry(f.orgId, updatedEvent(f.stripeCustomerId));
  assert.equal(await countMembersWithExpiringCard(f.orgId), 0);

  // Dos años después la tarjeta nueva también caduca.
  await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));
  assert.equal(await countMembersWithExpiringCard(f.orgId), 1);
});

test("el panel respeta el ámbito de centro de quien mira", async () => {
  const f = await createFixture("ambito");
  const otroCentro = await prisma.center.create({
    data: { orgId: f.orgId, name: "Otro centro", slug: `${SUFFIX}-ambito-otro` },
  });

  await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));

  assert.equal(await countMembersWithExpiringCard(f.orgId, [f.centerId]), 1);
  assert.equal(
    await countMembersWithExpiringCard(f.orgId, [otroCentro.id]),
    0,
    "recepción de otro centro no cuenta socios que no son suyos"
  );
});

test("un cliente de Stripe que no reconocemos no escribe nada", async () => {
  const f = await createFixture("desconocido");

  const result = await reconcileCardExpiry(f.orgId, expiringEvent("cus_de_otra_galaxia"));

  assert.equal(result.ok, true, "para Stripe está visto: no es un fallo que haya que reintentar");
  assert.equal(await countMembersWithExpiringCard(f.orgId), 0);
  assert.equal(await prisma.auditLog.count({ where: { orgId: f.orgId } }), 0);
});

test("una tarjeta por caducar no es una morosidad: no marca al socio ni le corta nada", async () => {
  const f = await createFixture("no-moroso");

  await reconcileCardExpiry(f.orgId, expiringEvent(f.stripeCustomerId));

  const member = await prisma.member.findUniqueOrThrow({ where: { id: f.memberId } });
  assert.notEqual(member.state, "DELINQUENT");
  assert.equal(member.delinquentSince, null, "todavía no ha fallado ningún cobro");
});
