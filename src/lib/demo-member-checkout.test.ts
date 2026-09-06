import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { isDemoModeActive } from "@/lib/platform-plans";
import {
  confirmDemoMemberCheckout,
  generateDemoMemberCheckoutToken,
  loadDemoMemberCheckout,
  verifyDemoMemberCheckoutToken,
  type DemoMemberCheckoutIntent,
} from "@/lib/demo-member-checkout";
import { createMemberCheckout } from "@/lib/member-billing";
import { ledgerBalance, ledgerReconciles } from "@/lib/session-ledger";

/**
 * HU-ST-11 / RB-PAGO-024 · `/demo-checkout` sustituía el checkout de LICENCIA
 * sin `STRIPE_SECRET_KEY`, pero no había equivalente para el plano 2: sin
 * Stripe, el socio simplemente no podía comprar, y con ello toda la mitad del
 * producto que se enseña en una demo —bono, saldo, reserva— quedaba
 * inalcanzable.
 *
 * Este entorno NO tiene `STRIPE_SECRET_KEY` (el CI la deja sin definir a
 * propósito), así que es exactamente el escenario de la historia.
 */

const SLUG = "e2e-demo-member-checkout";

type Fixture = { orgId: string; centerId: string; memberId: string; planId: string };

async function fixture(tag: string): Promise<Fixture> {
  const org = await prisma.organization.create({ data: { name: `Demo ${tag}`, slug: `${SLUG}-${tag}` } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro", slug: `${SLUG}-${tag}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Ana",
      lastName: "Demo",
      email: `${SLUG}-${tag}@example.com`,
    },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Bono 10", type: "SESSION_PACK", priceCents: 8900, sessionsIncluded: 10 },
  });
  return { orgId: org.id, centerId: center.id, memberId: member.id, planId: plan.id };
}

function intentFor(fx: Fixture): DemoMemberCheckoutIntent {
  return {
    orgId: fx.orgId,
    memberId: fx.memberId,
    planId: fx.planId,
    centerId: fx.centerId,
    soldByUserId: null,
    returnPath: "/portal/membresia",
  };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.sessionLedger.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("sin Stripe configurado, la compra de socio cae al checkout de demostración", async () => {
  assert.equal(isDemoModeActive(), true, "este entorno no tiene STRIPE_SECRET_KEY: es el escenario de la historia");
  const fx = await fixture("cae");

  const result = await createMemberCheckout({
    orgId: fx.orgId,
    memberId: fx.memberId,
    planId: fx.planId,
    origin: "portal",
  });

  assert.equal(result.ok, true, "antes esto era un 'no se puede comprar' sin salida");
  assert.match(result.ok ? result.url : "", /\/demo-checkout\/socio\?t=/);
});

test("confirmar deja lo mismo que dejaría el webhook: bono con su saldo y recibo PAID", async () => {
  const fx = await fixture("confirmar");
  const token = generateDemoMemberCheckoutToken(intentFor(fx));

  const result = await confirmDemoMemberCheckout(token);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.returnPath, "/portal/membresia");

  const subs = await prisma.subscription.findMany({ where: { memberId: fx.memberId } });
  assert.equal(subs.length, 1);
  assert.equal(subs[0].sessionsRemaining, 10, "el saldo lo resuelve createSubscriptionFromPlan, como en el cobro real");
  assert.equal(subs[0].centerId, fx.centerId);

  const payments = await prisma.payment.findMany({ where: { orgId: fx.orgId } });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].status, "PAID");
  assert.match(payments[0].notes ?? "", /DEMOSTRACIÓN/, "el recibo tiene que decir que no hubo cobro");
});

test("la compra de demostración deja el libro mayor cuadrado (E2-15)", async () => {
  // Invariante del trimestre: ninguna operación mueve `sessionsRemaining` sin
  // escribir en SessionLedger. El alta por esta vía no es una excepción.
  const fx = await fixture("libro");
  await confirmDemoMemberCheckout(generateDemoMemberCheckoutToken(intentFor(fx)));

  const subscription = await prisma.subscription.findFirstOrThrow({ where: { memberId: fx.memberId } });
  const rows = await prisma.sessionLedger.findMany({
    where: { subscriptionId: subscription.id },
    select: { delta: true, reason: true },
  });

  assert.equal(rows.length, 1, "el alta es el primer movimiento del bono");
  assert.equal(rows[0].reason, "PURCHASE");
  assert.equal(ledgerBalance(rows), 10);
  assert.equal(
    ledgerReconciles(rows, subscription.sessionsRemaining),
    true,
    "la suma de deltas tiene que dar el saldo del bono"
  );
});

test("recargar la confirmación no regala un segundo bono", async () => {
  const fx = await fixture("idempotente");
  const token = generateDemoMemberCheckoutToken(intentFor(fx));

  await confirmDemoMemberCheckout(token);
  await confirmDemoMemberCheckout(token);

  assert.equal(await prisma.subscription.count({ where: { memberId: fx.memberId } }), 1);
  assert.equal(await prisma.payment.count({ where: { orgId: fx.orgId } }), 1);
});

test("el intent va firmado: no se puede regalar un bono editando la URL", async () => {
  const fx = await fixture("firma");
  const token = generateDemoMemberCheckoutToken(intentFor(fx));

  // Manipular la carga (otro plan, otro socio) invalida la firma.
  const [payload, mac] = token.split(".");
  const manipulado = Buffer.from(payload, "base64url").toString("utf8").replace(fx.planId, "plan_regalado");
  const falso = `${Buffer.from(manipulado, "utf8").toString("base64url")}.${mac}`;

  assert.equal(verifyDemoMemberCheckoutToken(falso).ok, false);
  const result = await confirmDemoMemberCheckout(falso);
  assert.equal(result.ok, false);
  assert.equal(await prisma.subscription.count({ where: { memberId: fx.memberId } }), 0);
});

test("un token caducado no confirma nada", async () => {
  const fx = await fixture("caducado");
  const token = generateDemoMemberCheckoutToken(intentFor(fx));

  // Se retrasa el reloj 31 minutos (el TTL es de 30).
  const ahora = Date.now;
  Date.now = () => ahora() + 31 * 60_000;
  try {
    const verificado = verifyDemoMemberCheckoutToken(token);
    assert.equal(verificado.ok, false);
    assert.equal(!verificado.ok && verificado.error, "expired");
  } finally {
    Date.now = ahora;
  }
});

test("un plan archivado deja de poder confirmarse aunque el token siga vivo", async () => {
  const fx = await fixture("archivado");
  const token = generateDemoMemberCheckoutToken(intentFor(fx));
  await prisma.membershipPlan.update({ where: { id: fx.planId }, data: { active: false } });

  assert.equal(await loadDemoMemberCheckout(intentFor(fx)), null);
  const result = await confirmDemoMemberCheckout(token);
  assert.equal(result.ok, false);
});

test("la pantalla enseña socio, producto e importe antes de confirmar", async () => {
  const fx = await fixture("resumen");
  const summary = await loadDemoMemberCheckout(intentFor(fx));
  assert.deepEqual(summary, {
    memberName: "Ana Demo",
    planName: "Bono 10",
    priceCents: 8900,
    recurring: false,
    returnPath: "/portal/membresia",
  });
});
