import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { createSubscriptionFromPlan, resolveSubscriptionTerms } from "@/lib/subscriptions";
import { reconcileMemberSubscriptionUpserted } from "@/lib/member-billing";
import { bonoUsage } from "@/lib/session-balance";

/**
 * E4-30 · Una sola función crea suscripciones. Lo que se prueba aquí es que los
 * cinco caminos (recepción, invitación, importación CSV, checkout puntual y
 * webhook recurrente) resuelven las MISMAS tres cifras, y en particular el
 * quinto: un plan `MONTHLY` con `sessionsIncluded: 8` comprado por Stripe
 * quedaba con `sessionsRemaining` null, que `bonoUsage` lee como ilimitado.
 */

const SLUG = "e2e-subscriptions-test";

type Fixture = { orgId: string; centerId: string; memberId: string; planId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Suscripciones", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Suscripciones",
      email: `${SLUG}@example.com`,
    },
  });
  // El plan de la historia: cuota mensual CON sesiones incluidas. En la semilla
  // no existe ninguno, y por eso este camino no se había ejercitado nunca.
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Cuota mensual 8", type: "MONTHLY", sessionsIncluded: 8, priceCents: 9900 },
  });
  fx = { orgId: org.id, centerId: center.id, memberId: member.id, planId: plan.id };
});

after(async () => {
  if (!fx) return;
  await prisma.subscription.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

const MENSUAL_CON_8 = { id: "plan-mensual", priceCents: 9900, sessionsIncluded: 8 };
const CUOTA_ILIMITADA = { id: "plan-ilimitado", priceCents: 4900, sessionsIncluded: null };

test("E4-30 · fuente única: los cinco caminos resuelven las mismas cifras", () => {
  // Recepción, invitación y checkout puntual no pasan condiciones: manda el plan.
  const recepcion = resolveSubscriptionTerms(MENSUAL_CON_8);
  const invitacion = resolveSubscriptionTerms(MENSUAL_CON_8);
  const checkout = resolveSubscriptionTerms(MENSUAL_CON_8);
  // El webhook recurrente tampoco: era el que no ponía saldo.
  const webhook = resolveSubscriptionTerms(MENSUAL_CON_8);
  // La importación solo manda cuando el CSV trae saldo; sin él, la misma regla.
  const importacionSinSaldo = resolveSubscriptionTerms(MENSUAL_CON_8, { sessionsRemaining: undefined });

  const esperado = { priceCents: 9900, sessionsIncluded: 8, sessionsRemaining: 8 };
  for (const [nombre, terms] of Object.entries({ recepcion, invitacion, checkout, webhook, importacionSinSaldo })) {
    assert.deepEqual(terms, esperado, `camino ${nombre}`);
  }
});

test("E4-30 · plan sin sesiones incluidas: ilimitado, como hoy", () => {
  const terms = resolveSubscriptionTerms(CUOTA_ILIMITADA);
  assert.deepEqual(terms, { priceCents: 4900, sessionsIncluded: null, sessionsRemaining: null });
  // `bonoUsage` sigue leyendo null como ilimitado: no hay reparto que enseñar.
  assert.equal(bonoUsage(terms.sessionsIncluded, terms.sessionsRemaining), null);
});

test("E4-30 · importación CSV: el saldo del fichero manda, el total sigue siendo el del plan", () => {
  const terms = resolveSubscriptionTerms(MENSUAL_CON_8, { priceCents: 8000, sessionsRemaining: 3 });
  assert.deepEqual(terms, { priceCents: 8000, sessionsIncluded: 8, sessionsRemaining: 3 });
  // Y la cuenta que ve el socio cuadra: 5 gastadas de 8, 3 disponibles.
  assert.deepEqual(bonoUsage(terms.sessionsIncluded, terms.sessionsRemaining), { total: 8, used: 5, remaining: 3 });
});

test("E4-30 · un saldo sin total contratado en el plan es todo lo que hubo", () => {
  const terms = resolveSubscriptionTerms(CUOTA_ILIMITADA, { sessionsRemaining: 4 });
  assert.deepEqual(terms, { priceCents: 4900, sessionsIncluded: 4, sessionsRemaining: 4 });
});

test("E4-30 · ilimitado explícito no hereda el total del plan", () => {
  const terms = resolveSubscriptionTerms(MENSUAL_CON_8, { sessionsRemaining: null });
  assert.deepEqual(terms, { priceCents: 9900, sessionsIncluded: null, sessionsRemaining: null });
});

test("E4-30 · createSubscriptionFromPlan escribe lo que resuelve", async () => {
  const plan = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: fx.planId } });
  const created = await createSubscriptionFromPlan(prisma, {
    memberId: fx.memberId,
    centerId: fx.centerId,
    plan,
  });
  assert.equal(created.sessionsRemaining, 8);
  assert.equal(created.sessionsIncluded, 8);
  assert.equal(created.priceCents, 9900);
  assert.equal(created.status, "ACTIVE");
  await prisma.subscription.delete({ where: { id: created.id } });
});

test("E4-30 · plan con sesiones incluidas comprado por Stripe: 8, no ilimitado", async () => {
  const stripeSubscriptionId = `sub_${SLUG}`;
  const now = Math.floor(Date.now() / 1000);
  // Forma mínima del evento `customer.subscription.created` que llega del
  // webhook: lo único fiable para reconstruir el contexto es su `metadata`.
  const stripeSubscription = {
    id: stripeSubscriptionId,
    status: "active",
    metadata: { orgId: fx.orgId, memberId: fx.memberId, planId: fx.planId },
    items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86400 }] },
  } as unknown as Stripe.Subscription;

  await reconcileMemberSubscriptionUpserted(fx.orgId, stripeSubscription);

  const created = await prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId } });
  assert.equal(
    created.sessionsRemaining,
    8,
    "el mismo plan vendido en recepción quedaba topado a 8 y por Stripe quedaba ilimitado"
  );
  assert.equal(created.sessionsIncluded, 8);
  assert.notEqual(bonoUsage(created.sessionsIncluded, created.sessionsRemaining), null, "no es un bono ilimitado");

  await prisma.subscription.delete({ where: { id: created.id } });
});
