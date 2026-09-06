import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { isPendingStripeSync, syncPlanToStripe } from "@/lib/stripe-catalog";
import { saveMembershipPlan, setMembershipPlanActive } from "@/lib/membership-plans";
import { createMemberCheckout, createProspectMemberCheckout, ensureStripePrice } from "@/lib/member-billing";

/**
 * HU-ST-08 · El espejo del catálogo era perezoso y de ida sola: se creaba en el
 * primer checkout y a partir de ahí nada volvía a Stripe. Un cambio de precio
 * dejaba el Price viejo activo, `name`/`description`/`imageUrl` no se
 * propagaban nunca, archivar no ponía `active:false` en Stripe, y —lo más caro—
 * **un plan archivado seguía siendo vendible** desde recepción y desde el
 * portal: solo el catálogo del socio filtraba por `active`.
 *
 * Este entorno no tiene `STRIPE_SECRET_KEY` (el CI la deja sin definir para que
 * `/planes` arranque en modo demo), así que lo que se prueba aquí es el
 * contrato observable sin la pasarela: la degradación a "pendiente de
 * sincronizar", la invalidación del espejo al cambiar el precio, el archivado
 * (nunca borrado) y el rechazo del plan archivado en las tres puertas de venta.
 */

const SLUG = "e2e-stripe-catalog-test";

type Fixture = { orgId: string; centerId: string; memberId: string };

async function fixture(tag: string): Promise<Fixture> {
  const org = await prisma.organization.create({ data: { name: `Catálogo ${tag}`, slug: `${SLUG}-${tag}` } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro", slug: `${SLUG}-${tag}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: tag,
      email: `${SLUG}-${tag}@example.com`,
    },
  });
  return { orgId: org.id, centerId: center.id, memberId: member.id };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.stripeAccount.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("sin Stripe conectado el producto se crea solo en Apta, pendiente de sincronizar", async () => {
  const fx = await fixture("sin-stripe");

  const result = await saveMembershipPlan(fx.orgId, { name: "Bono 10", planType: "SESSION_PACK", priceCents: 8900, sessionsIncluded: 10 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.stripe.state, "pending", "sin cuenta conectada no hay a dónde sincronizar");

  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: result.id } });
  assert.equal(plan.stripePriceId, null);
  assert.equal(isPendingStripeSync(plan), true, "la UI tiene que poder marcarlo");
});

test("cambiar el precio invalida el espejo para que se cree un Price nuevo", async () => {
  const fx = await fixture("precio");

  const creado = await saveMembershipPlan(fx.orgId, { name: "Cuota", planType: "MONTHLY", priceCents: 4900 });
  assert.equal(creado.ok, true);
  if (!creado.ok) return;

  // Se simula un espejo ya creado en Stripe (no hay pasarela en este entorno).
  await prisma.membershipPlan.update({
    where: { id: creado.id },
    data: { stripeProductId: "prod_viejo", stripePriceId: "price_viejo", stripeAccountId: "acct_x" },
  });

  const editado = await saveMembershipPlan(fx.orgId, {
    planId: creado.id,
    name: "Cuota",
    planType: "MONTHLY",
    priceCents: 5900,
  });
  assert.equal(editado.ok, true);
  assert.equal(editado.ok && editado.priceChanged, true);

  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: creado.id } });
  assert.equal(plan.priceCents, 5900);
  assert.equal(plan.stripePriceId, null, "el precio viejo ya no vale: hay que crear uno nuevo");
  // RB-VENTA-007: el Product NO se toca (no se borra ni se recrea por un cambio
  // de importe) — lo que cambia es el Price.
  assert.equal(plan.stripeProductId, "prod_viejo");
});

test("cambiar solo el nombre o la descripción no invalida el precio", async () => {
  const fx = await fixture("nombre");

  const creado = await saveMembershipPlan(fx.orgId, { name: "Bono 5", planType: "SESSION_PACK", priceCents: 4500, sessionsIncluded: 5 });
  assert.equal(creado.ok, true);
  if (!creado.ok) return;
  await prisma.membershipPlan.update({
    where: { id: creado.id },
    data: { stripeProductId: "prod_x", stripePriceId: "price_x", stripeAccountId: "acct_x" },
  });

  const editado = await saveMembershipPlan(fx.orgId, {
    planId: creado.id,
    name: "Bono 5 sesiones",
    description: "Cinco sesiones a tu ritmo.",
    planType: "SESSION_PACK",
    priceCents: 4500,
    sessionsIncluded: 5,
  });
  assert.equal(editado.ok && editado.priceChanged, false);

  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: creado.id } });
  assert.equal(plan.name, "Bono 5 sesiones");
  assert.equal(plan.description, "Cinco sesiones a tu ritmo.");
  assert.equal(plan.stripePriceId, "price_x", "un cambio de rótulo no puede generar precio nuevo");
});

test("archivar oculta el producto sin borrar nada del histórico", async () => {
  const fx = await fixture("archivar");

  const creado = await saveMembershipPlan(fx.orgId, { name: "Bono retirado", planType: "SESSION_PACK", priceCents: 3900, sessionsIncluded: 4 });
  assert.equal(creado.ok, true);
  if (!creado.ok) return;

  // Alguien lo tiene contratado: archivar no puede tocarle nada.
  const subscription = await prisma.subscription.create({
    data: {
      memberId: fx.memberId,
      planId: creado.id,
      centerId: fx.centerId,
      startDate: new Date(),
      priceCents: 3900,
      sessionsIncluded: 4,
      sessionsRemaining: 4,
    },
  });

  const result = await setMembershipPlanActive(fx.orgId, creado.id, false);
  assert.equal(result.ok, true);

  const plan = await prisma.membershipPlan.findUnique({ where: { id: creado.id } });
  assert.ok(plan, "RB-VENTA-007: archivar, nunca borrar");
  assert.equal(plan.active, false);

  const viva = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(viva.status, "ACTIVE", "quien lo tiene contratado sigue igual");
});

test("un plan archivado ya no se puede vender por ninguna puerta", async () => {
  const fx = await fixture("vender-archivado");

  const creado = await saveMembershipPlan(fx.orgId, { name: "Bono muerto", planType: "SESSION_PACK", priceCents: 2900, sessionsIncluded: 3 });
  assert.equal(creado.ok, true);
  if (!creado.ok) return;
  await setMembershipPlanActive(fx.orgId, creado.id, false);

  // Cuenta conectada operativa: así el rechazo no puede venir de "no hay Stripe".
  await prisma.stripeAccount.create({
    data: { orgId: fx.orgId, accountId: `acct_${SLUG}-vender`, chargesEnabled: true, payoutsEnabled: true },
  });

  const desdeRecepcion = await createMemberCheckout({
    orgId: fx.orgId,
    memberId: fx.memberId,
    planId: creado.id,
    origin: "staff",
  });
  assert.equal(desdeRecepcion.ok, false);
  assert.match(desdeRecepcion.ok === false ? desdeRecepcion.error : "", /archivado/);

  const desdeLanding = await createProspectMemberCheckout({
    orgId: fx.orgId,
    centerId: fx.centerId,
    planId: creado.id,
    firstName: "Ana",
    lastName: "Prospecto",
    email: `${SLUG}-prospecto@example.com`,
  });
  assert.equal(desdeLanding.ok, false);
  assert.match(desdeLanding.ok === false ? desdeLanding.error : "", /archivado/);

  const espejo = await ensureStripePrice(fx.orgId, creado.id);
  assert.equal(espejo.ok, false, "tampoco se le crea espejo a un plan retirado");
});

test("sincronizar un plan que no existe no revienta", async () => {
  const fx = await fixture("inexistente");
  await prisma.stripeAccount.create({
    data: { orgId: fx.orgId, accountId: `acct_${SLUG}-inexistente`, chargesEnabled: true, payoutsEnabled: true },
  });

  const result = await syncPlanToStripe(fx.orgId, "plan_que_no_existe", null);
  // Sin STRIPE_SECRET_KEY en este entorno el corte llega antes, en `stripeForOrg`.
  assert.ok(result.state === "pending" || result.state === "failed");
});
