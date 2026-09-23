import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  catalogPriceKey,
  ensurePlanPriceForAccount,
  isPendingStripeSync,
  readPlanSnapshot,
  syncPlanToStripe,
  type CatalogStripe,
  type CatalogStripeResolver,
} from "@/lib/stripe-catalog";
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

// ---------- CON-03 / CON-04: con una pasarela de mentira ----------

/**
 * Stripe de mentira con lo que importa aquí: los Price son inmutables, se
 * archivan con `active:false`, y una clave de idempotencia repetida devuelve
 * LA MISMA respuesta que la primera vez (como el de verdad durante 24 h),
 * aunque ese Price esté ya archivado.
 */
type FakePrice = {
  id: string;
  product: string;
  active: boolean;
  currency: string;
  unit_amount: number;
  recurring: { interval: string; interval_count: number } | null;
};

function fakeCatalogStripe() {
  const prices: FakePrice[] = [];
  const byKey = new Map<string, string>();
  let productSeq = 0;
  const stripe = {
    products: {
      create: async () => ({ id: `prod_${++productSeq}` }),
      update: async (id: string) => ({ id }),
    },
    prices: {
      list: async (params: { product: string; active?: boolean }) => ({
        data: prices
          .filter((p) => p.product === params.product && (params.active === undefined || p.active === params.active))
          .map((p) => ({ ...p })),
      }),
      create: async (
        params: { product: string; unit_amount: number; currency: string; recurring?: { interval: string } },
        opts: { idempotencyKey?: string }
      ) => {
        const cachedId = opts.idempotencyKey ? byKey.get(opts.idempotencyKey) : undefined;
        if (cachedId) return { ...prices.find((p) => p.id === cachedId)! };
        const price: FakePrice = {
          id: `price_${prices.length + 1}`,
          product: params.product,
          active: true,
          currency: params.currency,
          unit_amount: params.unit_amount,
          recurring: params.recurring ? { interval: params.recurring.interval, interval_count: 1 } : null,
        };
        prices.push(price);
        if (opts.idempotencyKey) byKey.set(opts.idempotencyKey, price.id);
        return { ...price };
      },
      update: async (id: string, params: { active?: boolean }) => {
        const price = prices.find((p) => p.id === id)!;
        if (params.active !== undefined) price.active = params.active;
        return { ...price };
      },
    },
  };
  const resolver: CatalogStripeResolver = async () => ({
    ok: true,
    stripe: stripe as unknown as CatalogStripe,
    accountId: "acct_fake",
  });
  return { prices, resolver };
}

/** Lo que hace `saveMembershipPlan` al cambiar el importe, con la pasarela de mentira. */
async function cambiarImporte(orgId: string, planId: string, priceCents: number, resolver: CatalogStripeResolver) {
  const before = await readPlanSnapshot(orgId, planId);
  await prisma.membershipPlan.update({ where: { id: planId }, data: { priceCents, stripePriceId: null } });
  return syncPlanToStripe(orgId, planId, before, null, resolver);
}

test("CON-03: la clave del Price cambia con el Price al que sustituye", () => {
  assert.notEqual(
    catalogPriceKey("org_1", "plan_1", 4900, true, null),
    catalogPriceKey("org_1", "plan_1", 4900, true, "price_B"),
    "volver a 49 € desde 59 € no puede reutilizar la clave del primer 49 €"
  );
  assert.equal(
    catalogPriceKey("org_1", "plan_1", 4900, true, "price_B"),
    catalogPriceKey("org_1", "plan_1", 4900, true, "price_B"),
    "el doble clic sigue colisionando"
  );
});

test("CON-03: importe A → B → A en el mismo día deja un Price ACTIVO vendible", async () => {
  const fx = await fixture("aba");
  const { prices, resolver } = fakeCatalogStripe();
  const plan = await prisma.membershipPlan.create({
    data: { orgId: fx.orgId, name: "Cuota", type: "MONTHLY", priceCents: 4900 },
  });

  const a = await syncPlanToStripe(fx.orgId, plan.id, null, null, resolver);
  assert.equal(a.state, "synced");
  const b = await cambiarImporte(fx.orgId, plan.id, 5900, resolver);
  assert.equal(b.state, "synced");
  const a2 = await cambiarImporte(fx.orgId, plan.id, 4900, resolver);
  assert.equal(a2.state, "synced");
  if (a.state !== "synced" || b.state !== "synced" || a2.state !== "synced") return;

  const vendible = prices.find((p) => p.id === a2.priceId)!;
  assert.equal(vendible.active, true, "el checkout falla con un Price archivado");
  assert.equal(vendible.unit_amount, 4900);
  assert.notEqual(a2.priceId, a.priceId, "el Price A original está archivado y no se reutiliza");
  // RB-VENTA-007: los anteriores quedan archivados, nunca borrados.
  assert.equal(prices.length, 3);
  assert.deepEqual(
    prices.filter((p) => p.active).map((p) => p.id),
    [a2.priceId],
    "un solo Price activo por producto"
  );
});

test("CON-04: ensurePlanPriceForAccount crea el Price, lo guarda y archiva el anterior", async () => {
  const fx = await fixture("puerta");
  const { prices, resolver } = fakeCatalogStripe();
  const plan = await prisma.membershipPlan.create({
    data: { orgId: fx.orgId, name: "Bono 10", type: "SESSION_PACK", priceCents: 8900, sessionsIncluded: 10 },
  });

  const first = await ensurePlanPriceForAccount(fx.orgId, plan.id, resolver);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  const guardado = await prisma.membershipPlan.findUniqueOrThrow({ where: { id: plan.id } });
  assert.equal(guardado.stripePriceId, first.priceId);
  assert.equal(guardado.stripeAccountId, "acct_fake");

  // Espejo al día: segunda llamada sin crear nada.
  const again = await ensurePlanPriceForAccount(fx.orgId, plan.id, resolver);
  assert.equal(again.ok && again.priceId, first.priceId);
  assert.equal(prices.length, 1);

  // Cambio de importe con Stripe caído: el plan se invalidó en local y el
  // `before` se perdió. La puerta crea el nuevo y archiva el que seguía activo.
  await prisma.membershipPlan.update({ where: { id: plan.id }, data: { priceCents: 9900, stripePriceId: null } });
  const next = await ensurePlanPriceForAccount(fx.orgId, plan.id, resolver);
  assert.equal(next.ok, true);
  if (!next.ok) return;
  assert.notEqual(next.priceId, first.priceId);
  assert.equal(prices.find((p) => p.id === first.priceId)!.active, false, "archivado, no borrado");
  assert.equal(prices.find((p) => p.id === next.priceId)!.active, true);
  assert.equal(prices.find((p) => p.id === next.priceId)!.recurring, null, "un bono es un pago único");
});

test("CON-04: ensurePlanPriceForAccount respeta la organización y el archivado", async () => {
  const fx = await fixture("puerta-ambito");
  const otra = await fixture("puerta-otra");
  const { prices, resolver } = fakeCatalogStripe();
  const plan = await prisma.membershipPlan.create({
    data: { orgId: fx.orgId, name: "Cuota", type: "MONTHLY", priceCents: 4900 },
  });

  const ajena = await ensurePlanPriceForAccount(otra.orgId, plan.id, resolver);
  assert.deepEqual(ajena, { ok: false, error: "Plan no encontrado." });

  await prisma.membershipPlan.update({ where: { id: plan.id }, data: { active: false } });
  const archivado = await ensurePlanPriceForAccount(fx.orgId, plan.id, resolver);
  assert.equal(archivado.ok, false);
  assert.equal(prices.length, 0, "no se crea nada en Stripe para un plan que no se vende");
});
