import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  assertRefundable,
  clampGraceDays,
  graceDeadline,
  graceWindowFor,
  GRACE_DAYS_DEFAULT,
  isLiveKey,
  isWithinGraceWindow,
  stripeReadClient,
  type RefundablePayment,
} from "@/lib/billing-shared";

/**
 * Lote 2 · Helpers compartidos (S1).
 *
 * Existen para que ninguna de las siete pistas se invente el suyo. Lo que se
 * prueba aquí es su comportamiento principal, que es también el contrato que
 * las pistas van a dar por bueno sin volver a mirarlo.
 */

const SLUG = "e2e-billing-shared";
let orgId = "";

// `stripeReadClient` comprueba la clave ANTES que la cuenta conectada, así que
// sin esto las pruebas de la cuenta medirían la rama equivocada.
process.env.STRIPE_SECRET_KEY ||= "sk_test_billing_shared";

function cobro(over: Partial<RefundablePayment> = {}): RefundablePayment {
  return {
    method: "STRIPE",
    status: "PAID",
    amountCents: 6000,
    stripePaymentIntentId: "pi_1",
    ...over,
  };
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.stripeAccount.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({
    data: { name: "Helpers lote 2", slug: SLUG, dunningGraceDays: 14 },
  });
  orgId = org.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// assertRefundable
// ---------------------------------------------------------------------------

test("assertRefundable: un pago en efectivo se devuelve en local, sin llamar a Stripe", () => {
  const decision = assertRefundable(cobro({ method: "CASH", stripePaymentIntentId: null }));
  assert.equal(decision.refundable, true);
  assert.equal(decision.refundable === true && decision.via, "LOCAL");
});

test("assertRefundable: los demás cobros de caja tampoco pasan por Stripe", () => {
  for (const method of ["TRANSFER", "BIZUM", "CARD", "SEPA"] as const) {
    const decision = assertRefundable(cobro({ method, stripePaymentIntentId: null }));
    assert.equal(decision.refundable === true && decision.via, "LOCAL", `${method} no debería ir a Stripe`);
  }
});

test("assertRefundable: un cobro de Stripe se devuelve contra Stripe", () => {
  const decision = assertRefundable(cobro());
  assert.equal(decision.refundable, true);
  assert.equal(decision.refundable === true && decision.via, "STRIPE");
  assert.equal(decision.refundable === true && decision.maxRefundableCents, 6000);
});

test("assertRefundable: un pago ya devuelto no se devuelve dos veces", () => {
  const total = assertRefundable(cobro({ status: "REFUNDED", refundedAt: new Date() }));
  assert.equal(total.refundable, false);

  // Y el caso del doble clic sobre un parcial que ya agotó el importe.
  const agotado = assertRefundable(cobro({ refundedAmountCents: 6000 }));
  assert.equal(agotado.refundable, false);
});

test("assertRefundable: una devolución parcial deja disponible solo lo que queda", () => {
  const decision = assertRefundable(cobro({ refundedAmountCents: 1000 }));
  assert.equal(decision.refundable, true);
  assert.equal(decision.refundable === true && decision.maxRefundableCents, 5000);

  // Pedir más de lo que queda se rechaza: dos parciales seguidos no pueden
  // devolver más de lo cobrado.
  const pasado = assertRefundable(cobro({ refundedAmountCents: 1000 }), 5001);
  assert.equal(pasado.refundable, false);

  const justo = assertRefundable(cobro({ refundedAmountCents: 1000 }), 5000);
  assert.equal(justo.refundable, true);
});

test("assertRefundable: un importe absurdo se rechaza antes de llegar a Stripe", () => {
  for (const importe of [0, -100, 12.5]) {
    assert.equal(assertRefundable(cobro(), importe).refundable, false, `${importe} tenía que rebotar`);
  }
});

test("assertRefundable: no se devuelve lo que nunca entró", () => {
  assert.equal(assertRefundable(cobro({ status: "FAILED" })).refundable, false);
  assert.equal(assertRefundable(cobro({ status: "PENDING" })).refundable, false);
});

test("assertRefundable: un cobro de Stripe sin referencia se para en vez de devolverse en local", () => {
  // Devolverlo "en local" dejaría el dinero en Stripe y el recibo diciendo que
  // se devolvió.
  const decision = assertRefundable(
    cobro({ stripePaymentIntentId: null, stripeCheckoutSessionId: null, stripeInvoiceId: null })
  );
  assert.equal(decision.refundable, false);
  assert.match(decision.refundable === false ? decision.error : "", /Dashboard de Stripe/);
});

test("assertRefundable: vale cualquiera de las tres referencias de Stripe", () => {
  for (const ref of ["stripeCheckoutSessionId", "stripeInvoiceId"] as const) {
    const decision = assertRefundable(cobro({ stripePaymentIntentId: null, [ref]: "ref_1" }));
    assert.equal(decision.refundable === true && decision.via, "STRIPE", `${ref} tenía que servir`);
  }
});

// ---------------------------------------------------------------------------
// graceWindowFor
// ---------------------------------------------------------------------------

test("graceWindowFor: devuelve el periodo del centro, leído del servidor", async () => {
  assert.equal(await graceWindowFor(orgId), 14, "el de esta organización, no el general");
});

test("graceWindowFor: una organización que no existe cae al valor por defecto (D-S5)", async () => {
  assert.equal(await graceWindowFor("org_que_no_existe"), GRACE_DAYS_DEFAULT);
  assert.equal(GRACE_DAYS_DEFAULT, 7);
});

test("clampGraceDays: nada se sale de 0-60, venga de donde venga", () => {
  assert.equal(clampGraceDays(-5), 0);
  assert.equal(clampGraceDays(0), 0);
  assert.equal(clampGraceDays(7), 7);
  assert.equal(clampGraceDays(60), 60);
  assert.equal(clampGraceDays(999), 60);
  assert.equal(clampGraceDays(null), GRACE_DAYS_DEFAULT);
  assert.equal(clampGraceDays(undefined), GRACE_DAYS_DEFAULT);
  assert.equal(clampGraceDays(Number.NaN), GRACE_DAYS_DEFAULT);
});

test("graceDeadline: son días naturales desde el primer impago", () => {
  const impago = new Date("2026-09-01T10:00:00Z");
  assert.deepEqual(graceDeadline(impago, 7), new Date("2026-09-08T10:00:00Z"));
  assert.equal(graceDeadline(null, 7), null, "sin impago abierto no hay fecha de corte");
});

test("isWithinGraceWindow: el socio reserva durante la gracia y deja de reservar al agotarse", () => {
  const impago = new Date("2026-09-01T10:00:00Z");

  assert.equal(
    isWithinGraceWindow(impago, 7, new Date("2026-09-05T10:00:00Z")),
    true,
    "primer fallo: el socio TODAVÍA puede reservar"
  );
  assert.equal(
    isWithinGraceWindow(impago, 7, new Date("2026-09-09T10:00:00Z")),
    false,
    "agotada la ventana: se corta la reserva de nuevas sesiones"
  );
  assert.equal(
    isWithinGraceWindow(null, 7, new Date("2026-09-09T10:00:00Z")),
    true,
    "sin impago abierto, la morosidad no corta nada"
  );
});

test("isWithinGraceWindow: con 0 días el corte es inmediato", () => {
  const impago = new Date("2026-09-01T10:00:00Z");
  assert.equal(isWithinGraceWindow(impago, 0, new Date("2026-09-01T10:00:01Z")), false);
});

// ---------------------------------------------------------------------------
// stripeReadClient
// ---------------------------------------------------------------------------

test("stripeReadClient: sin cuenta conectada lo dice, no revienta", async () => {
  const cliente = await stripeReadClient(orgId);
  assert.equal(cliente.ok, false);
  assert.match(cliente.ok === false ? cliente.error : "", /no ha conectado/);
});

test("stripeReadClient: sin clave de Stripe degrada con su motivo, no con la de la cuenta", async () => {
  const real = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  try {
    const cliente = await stripeReadClient(orgId);
    assert.equal(cliente.ok, false);
    assert.match(cliente.ok === false ? cliente.error : "", /STRIPE_SECRET_KEY/);
  } finally {
    process.env.STRIPE_SECRET_KEY = real;
  }
});

test("stripeReadClient: lee de una cuenta que TODAVÍA no puede cobrar", async () => {
  // Es la diferencia con `stripeForOrg`, que se niega sin `chargesEnabled`: la
  // consola de dirección tiene que poder mirar durante el onboarding, que es
  // justo cuando más falta hace.
  await prisma.stripeAccount.create({
    data: { orgId, accountId: `acct_${SLUG}`, chargesEnabled: false, payoutsEnabled: false },
  });

  const cliente = await stripeReadClient(orgId);
  assert.equal(cliente.ok, true);
  assert.equal(cliente.ok === true && cliente.accountId, `acct_${SLUG}`);
});

test("isLiveKey: el distintivo TEST/LIVE sale del prefijo, y una clave restringida de test no es LIVE", () => {
  assert.equal(isLiveKey("sk_live_abc"), true);
  assert.equal(isLiveKey("rk_live_abc"), true);
  assert.equal(isLiveKey("sk_test_abc"), false);
  assert.equal(isLiveKey("rk_test_abc"), false, "una clave restringida de pruebas no puede pintar LIVE");
  assert.equal(isLiveKey(undefined), false);
});
