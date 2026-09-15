import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import type { ScopedUser } from "@/lib/center-scope";
import { refundKey } from "@/lib/stripe-idempotency";
import {
  canIssueRefund,
  issueRefund,
  listIssuedRefunds,
  listRefundCandidates,
  reconcileChargeRefunded,
  reconcileCreditNote,
  REFUND_AUDIT_ACTION_LOCAL,
  REFUND_FORBIDDEN,
  REFUND_OUT_OF_SCOPE,
  REFUND_REASON_REQUIRED,
} from "@/lib/stripe-refunds";

/**
 * HU-ST-20 · Reembolsos reales y notas de crédito (P2).
 *
 * Los dos escenarios que deciden si la historia está bien hecha son el "doble
 * clic" y el de "permisos", y los dos están aquí. Con ellos van el de "pago en
 * efectivo" —el que más se olvida— y la conciliación por webhook de la
 * devolución parcial, que es donde `charge.amount_refunded` engaña.
 *
 * Esta organización NO tiene cuenta de Stripe conectada, y es deliberado: es lo
 * que convierte "no ha llamado a Stripe" en una aserción de verdad. Un cobro de
 * caja se devuelve igual; uno de Stripe se para en el guardián de la cuenta sin
 * haber tocado la fila local.
 */

const SLUG = "e2e-stripe-refunds";

// `stripeForOrg` comprueba la clave de la plataforma ANTES que la cuenta
// conectada. Sin esto, la prueba del cobro de Stripe mediría la rama
// equivocada: fallaría por "falta STRIPE_SECRET_KEY" y no por la cuenta.
process.env.STRIPE_SECRET_KEY ||= "sk_test_stripe_refunds";

let orgId = "";
let centerA = "";
let centerB = "";
let memberA = "";
let memberB = "";
let direccion: ScopedUser;
let direccionCentroB: ScopedUser;
let recepcion: ScopedUser;

async function makeUser(tag: string, role: "OWNER" | "CENTER_DIRECTOR" | "RECEPTION", centerId: string | null) {
  const email = `${SLUG}-${tag}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const user = await prisma.user.create({
    data: { orgId, identityId: identity.id, name: tag, email, role, centerId },
  });
  return { id: user.id, role, orgId, centerId } satisfies ScopedUser;
}

async function makePayment(over: {
  memberId?: string;
  amountCents?: number;
  method?: "CASH" | "STRIPE";
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  stripeBalanceTransactionId?: string;
}) {
  return prisma.payment.create({
    data: {
      orgId,
      memberId: over.memberId ?? memberA,
      amountCents: over.amountCents ?? 6000,
      method: over.method ?? "CASH",
      status: "PAID",
      date: new Date(),
      stripePaymentIntentId: over.stripePaymentIntentId,
      stripeInvoiceId: over.stripeInvoiceId,
      stripeBalanceTransactionId: over.stripeBalanceTransactionId,
    },
  });
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.paymentDispute.deleteMany({ where: { orgId: org.id } });
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  const users = await prisma.user.findMany({ where: { orgId: org.id }, select: { identityId: true } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Devoluciones", slug: SLUG } });
  orgId = org.id;

  centerA = (await prisma.center.create({ data: { orgId, name: "A", slug: `${SLUG}-a` } })).id;
  centerB = (await prisma.center.create({ data: { orgId, name: "B", slug: `${SLUG}-b` } })).id;

  memberA = (
    await prisma.member.create({
      data: { orgId, primaryCenterId: centerA, firstName: "Socio", lastName: "A", email: `${SLUG}-a@example.com` },
    })
  ).id;
  memberB = (
    await prisma.member.create({
      data: { orgId, primaryCenterId: centerB, firstName: "Socia", lastName: "B", email: `${SLUG}-b@example.com` },
    })
  ).id;

  direccion = await makeUser("owner", "OWNER", null);
  direccionCentroB = await makeUser("director-b", "CENTER_DIRECTOR", centerB);
  recepcion = await makeUser("recepcion", "RECEPTION", centerA);
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Escenario: permisos
// ---------------------------------------------------------------------------

test("permisos: el predicado es dirección, y deja fuera a quien cobra todos los días", () => {
  assert.equal(canIssueRefund("OWNER"), true);
  assert.equal(canIssueRefund("CENTER_DIRECTOR"), true);
  // Recepción cobra y registra pagos, pero no saca dinero de la cuenta.
  assert.equal(canIssueRefund("RECEPTION"), false);
  assert.equal(canIssueRefund("TRAINER_ADMIN"), false);
  // Soporte de plataforma manda en Apta, no en el dinero de un cliente.
  assert.equal(canIssueRefund("PLATFORM_ADMIN"), false);
});

test("permisos: recepción no emite un reembolso ni llamando al motor directamente", async () => {
  const pago = await makePayment({});
  const resultado = await issueRefund({ actor: recepcion, paymentId: pago.id, reason: "se arrepintió" });

  assert.deepEqual(resultado, { ok: false, error: REFUND_FORBIDDEN });

  // Y no ha tocado nada: el rechazo es antes de escribir.
  const despues = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(despues.status, "PAID");
  assert.equal(despues.refundedAmountCents, null);
});

test("permisos: el motivo es obligatorio, no un campo opcional que nadie rellena", async () => {
  const pago = await makePayment({});

  assert.deepEqual(await issueRefund({ actor: direccion, paymentId: pago.id, reason: "" }), {
    ok: false,
    error: REFUND_REASON_REQUIRED,
  });
  // Espacios en blanco tampoco son un motivo.
  assert.deepEqual(await issueRefund({ actor: direccion, paymentId: pago.id, reason: "   " }), {
    ok: false,
    error: REFUND_REASON_REQUIRED,
  });

  const despues = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(despues.refundedAt, null);
});

test("permisos: cada devolución deja una entrada de AuditLog con autor y motivo", async () => {
  const pago = await makePayment({ amountCents: 4500 });
  const motivo = "lesión: baja médica con justificante";

  const resultado = await issueRefund({ actor: direccion, paymentId: pago.id, reason: motivo });
  assert.equal(resultado.ok, true);

  const entrada = await prisma.auditLog.findFirst({
    where: { orgId, entityType: "Payment", entityId: pago.id, action: REFUND_AUDIT_ACTION_LOCAL },
  });
  assert.ok(entrada, "la devolución no ha dejado traza en AuditLog");
  assert.equal(entrada.actorUserId, direccion.id);
  assert.equal(entrada.memberId, memberA);
  assert.deepEqual((entrada.metadata as { motivo: string }).motivo, motivo);

  // Y el motivo también queda en el propio cobro, para poder enseñarlo sin
  // releer el log.
  const despues = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(despues.refundReason, motivo);
  assert.equal(despues.refundedByUserId, direccion.id);
});

// ---------------------------------------------------------------------------
// Escenario: ámbito de centro
// ---------------------------------------------------------------------------

test("ámbito de centro: un reembolso de otro centro ni se ve ni se emite", async () => {
  const pago = await makePayment({ memberId: memberA, amountCents: 3000 });

  // La dirección del centro B no lo ve en su listado…
  const suyos = await listRefundCandidates(orgId, [centerB]);
  assert.equal(
    suyos.some((p) => p.id === pago.id),
    false
  );
  // …y tampoco lo devuelve por URL, con el id en la mano.
  assert.deepEqual(await issueRefund({ actor: direccionCentroB, paymentId: pago.id, reason: "por probar" }), {
    ok: false,
    error: REFUND_OUT_OF_SCOPE,
  });

  // El suyo sí lo ve y sí lo devuelve: el ámbito acota, no bloquea.
  const propio = await makePayment({ memberId: memberB, amountCents: 2000 });
  const suyosTrasAlta = await listRefundCandidates(orgId, [centerB]);
  assert.equal(
    suyosTrasAlta.some((p) => p.id === propio.id),
    true
  );
  const emitido = await issueRefund({ actor: direccionCentroB, paymentId: propio.id, reason: "cambio de centro" });
  assert.equal(emitido.ok, true);

  // Dirección de organización no tiene frontera: ve los dos.
  const todos = await listRefundCandidates(orgId);
  assert.equal(
    todos.some((p) => p.id === pago.id),
    true
  );
});

// ---------------------------------------------------------------------------
// Escenario: pago en efectivo
// ---------------------------------------------------------------------------

test("pago en efectivo: sigue el flujo local, SIN llamar a Stripe", async () => {
  // Esta organización no tiene cuenta de Stripe conectada. Si el efectivo
  // pasara por Stripe, esto fallaría con "aún no ha conectado su cuenta".
  const pago = await makePayment({ method: "CASH", amountCents: 6000 });

  const resultado = await issueRefund({ actor: direccion, paymentId: pago.id, reason: "devolución en mostrador" });
  assert.equal(resultado.ok, true);
  assert.equal(resultado.ok && resultado.via, "LOCAL");

  const despues = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(despues.status, "REFUNDED");
  assert.equal(despues.refundedAmountCents, 6000);
  // No hay refund de Stripe porque no ha habido llamada a Stripe.
  assert.equal(despues.stripeRefundId, null);
  assert.equal(despues.stripeCreditNoteId, null);
});

test("cobro de Stripe sin cuenta conectada: para en el guardián y no toca la fila local", async () => {
  const pago = await makePayment({ method: "STRIPE", stripePaymentIntentId: `pi_${SLUG}_sin_cuenta` });

  const resultado = await issueRefund({ actor: direccion, paymentId: pago.id, reason: "cambio de opinión" });
  assert.equal(resultado.ok, false);
  assert.match(resultado.ok ? "" : resultado.error, /cuenta de Stripe/i);

  const despues = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(despues.status, "PAID");
  assert.equal(despues.refundedAt, null);
});

// ---------------------------------------------------------------------------
// Escenario: doble clic
// ---------------------------------------------------------------------------

test("doble clic: los dos clics construyen la MISMA clave de idempotencia", async () => {
  const pago = await makePayment({ method: "STRIPE", amountCents: 6000, stripePaymentIntentId: `pi_${SLUG}_doble` });

  // Los dos clics leen el mismo estado del cobro (el primero todavía no ha
  // escrito), así que Stripe recibe dos peticiones con la misma clave y emite
  // UN solo refund.
  const clic1 = refundKey(orgId, pago.id, 6000, 0);
  const clic2 = refundKey(orgId, pago.id, 6000, 0);
  assert.equal(clic1, clic2);

  // Y una devolución parcial POSTERIOR del mismo importe sí es otra operación:
  // el acumulado ya devuelto entra en la clave y no la colapsa con la anterior.
  assert.notEqual(refundKey(orgId, pago.id, 1000, 0), refundKey(orgId, pago.id, 1000, 1000));
});

test("doble clic: emitida la devolución, la segunda se rechaza antes de llegar a Stripe", async () => {
  const pago = await makePayment({ method: "CASH", amountCents: 5000 });

  const primera = await issueRefund({ actor: direccion, paymentId: pago.id, reason: "primera" });
  assert.equal(primera.ok, true);

  // `assertRefundable` es la primera red y la que da un mensaje entendible; la
  // clave de idempotencia es la segunda, para la carrera que llega antes de que
  // esta fila esté escrita.
  const segunda = await issueRefund({ actor: direccion, paymentId: pago.id, reason: "segunda" });
  assert.equal(segunda.ok, false);
  assert.match(segunda.ok ? "" : segunda.error, /ya está devuelto/i);

  const despues = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(despues.refundedAmountCents, 5000, "la segunda no puede sumar otra vez");
  assert.equal(despues.refundReason, "primera", "la segunda no puede pisar el motivo de la que sí se emitió");
});

// ---------------------------------------------------------------------------
// Escenario: devolución parcial
// ---------------------------------------------------------------------------

test("devolución parcial: el cobro sigue siendo un cobro y refleja lo devuelto", async () => {
  const pago = await makePayment({ method: "CASH", amountCents: 6000 });

  const parcial = await issueRefund({ actor: direccion, paymentId: pago.id, amountCents: 1500, reason: "una clase" });
  assert.equal(parcial.ok, true);

  const tras = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(tras.status, "PAID", "un parcial NO deja el cobro en REFUNDED");
  assert.equal(tras.amountCents, 6000, "un parcial no toca el importe cobrado");
  assert.equal(tras.refundedAmountCents, 1500);

  // No se puede devolver más de lo que queda.
  const pasada = await issueRefund({ actor: direccion, paymentId: pago.id, amountCents: 5000, reason: "de más" });
  assert.equal(pasada.ok, false);
  assert.match(pasada.ok ? "" : pasada.error, /45\.00 €/);

  // Y el resto sí, que es lo que cierra el cobro.
  const resto = await issueRefund({ actor: direccion, paymentId: pago.id, amountCents: 4500, reason: "el resto" });
  assert.equal(resto.ok, true);
  const final = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(final.status, "REFUNDED");
  assert.equal(final.refundedAmountCents, 6000);

  const emitidas = await listIssuedRefunds(orgId, [centerA]);
  assert.equal(
    emitidas.some((p) => p.id === pago.id),
    true
  );
});

// ---------------------------------------------------------------------------
// Conciliación: charge.refunded
// ---------------------------------------------------------------------------

function charge(over: Partial<Stripe.Charge>): Stripe.Charge {
  return { id: `ch_${SLUG}`, amount_refunded: 0, refunded: false, ...over } as Stripe.Charge;
}

test("charge.refunded: sin cobro local es reintentable, no un evento consumido", async () => {
  const resultado = await reconcileChargeRefunded(orgId, charge({ payment_intent: `pi_${SLUG}_fantasma` }));
  assert.deepEqual(resultado.ok, false);
  assert.equal(resultado.ok === false && resultado.retry, true);
});

test("charge.refunded: el parcial escribe el acumulado y NO cambia el estado", async () => {
  const pi = `pi_${SLUG}_webhook_parcial`;
  const pago = await makePayment({ method: "STRIPE", amountCents: 6000, stripePaymentIntentId: pi });

  // `amount_refunded` es el ACUMULADO del cargo, no el importe de este refund.
  const resultado = await reconcileChargeRefunded(
    orgId,
    charge({ payment_intent: pi, amount_refunded: 2000, refunded: false })
  );
  assert.deepEqual(resultado, { ok: true });

  const tras = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(tras.status, "PAID");
  assert.equal(tras.refundedAmountCents, 2000);
  assert.ok(tras.refundedAt);

  // Segundo refund sobre el mismo cargo: el acumulado sube y ahora sí cierra.
  await reconcileChargeRefunded(orgId, charge({ payment_intent: pi, amount_refunded: 6000, refunded: true }));
  const final = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(final.status, "REFUNDED");
  assert.equal(final.refundedAmountCents, 6000);
});

test("charge.refunded: una reentrega del mismo evento no vuelve a escribir", async () => {
  const pi = `pi_${SLUG}_webhook_reentrega`;
  const pago = await makePayment({ method: "STRIPE", amountCents: 3000, stripePaymentIntentId: pi });

  await reconcileChargeRefunded(orgId, charge({ payment_intent: pi, amount_refunded: 3000, refunded: true }));
  const primera = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });

  await reconcileChargeRefunded(orgId, charge({ payment_intent: pi, amount_refunded: 3000, refunded: true }));
  const segunda = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });

  assert.deepEqual(segunda.refundedAt, primera.refundedAt, "la reentrega ha movido la fecha de devolución");
  assert.equal(segunda.refundedAmountCents, 3000);
});

test("charge.refunded: un cargo de suscripción se localiza por el refund que emitió Apta", async () => {
  // El `Payment` de una factura recurrente solo guarda `stripeInvoiceId`, y el
  // objeto `Charge` de esta versión de la API ya no trae la factura: el enlace
  // es el `stripeRefundId` que escribió `issueRefund`.
  const pago = await makePayment({ method: "STRIPE", amountCents: 4900, stripeInvoiceId: `in_${SLUG}_recurrente` });
  const refundId = `re_${SLUG}_recurrente`;
  await prisma.payment.update({ where: { id: pago.id }, data: { stripeRefundId: refundId } });

  const resultado = await reconcileChargeRefunded(
    orgId,
    charge({
      id: `ch_${SLUG}_recurrente`,
      amount_refunded: 4900,
      refunded: true,
      refunds: { data: [{ id: refundId }] } as Stripe.ApiList<Stripe.Refund>,
    })
  );
  assert.deepEqual(resultado, { ok: true });

  const tras = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(tras.status, "REFUNDED");
  assert.equal(tras.refundedAmountCents, 4900);
});

// ---------------------------------------------------------------------------
// Conciliación: credit_note.*
// ---------------------------------------------------------------------------

function creditNote(over: Partial<Stripe.CreditNote>): Stripe.CreditNote {
  return { id: `cn_${SLUG}`, status: "issued", ...over } as Stripe.CreditNote;
}

test("credit_note: la nota queda enlazada al cobro de su factura, y anularla la desenlaza", async () => {
  const invoiceId = `in_${SLUG}_nota`;
  const pago = await makePayment({ method: "STRIPE", amountCents: 4900, stripeInvoiceId: invoiceId });

  await reconcileCreditNote(orgId, creditNote({ invoice: invoiceId }), "credit_note.created");
  const enlazado = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(enlazado.stripeCreditNoteId, `cn_${SLUG}`);

  // Anular una nota DISTINTA no puede borrar el enlace bueno.
  await reconcileCreditNote(orgId, creditNote({ id: "cn_otra", invoice: invoiceId }), "credit_note.voided");
  const intacto = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(intacto.stripeCreditNoteId, `cn_${SLUG}`);

  // Anular LA nota enlazada sí: si no, la ficha enseñaría un abono que ya no existe.
  await reconcileCreditNote(orgId, creditNote({ invoice: invoiceId }), "credit_note.voided");
  const desenlazado = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(desenlazado.stripeCreditNoteId, null);
});

test("credit_note: sin cobro local para esa factura es reintentable", async () => {
  const resultado = await reconcileCreditNote(
    orgId,
    creditNote({ invoice: `in_${SLUG}_fantasma` }),
    "credit_note.created"
  );
  assert.equal(resultado.ok, false);
  assert.equal(resultado.ok === false && resultado.retry, true);
});
