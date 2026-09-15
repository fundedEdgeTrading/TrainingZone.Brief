import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  DISPUTE_AUDIT_CLOSED,
  DISPUTE_AUDIT_OPENED,
  listDisputes,
  mapDisputeStatus,
  reconcileDispute,
  stripeDisputeUrl,
} from "@/lib/stripe-disputes";

/**
 * HU-ST-21 · Disputas y contracargos visibles (P2).
 *
 * Los tres escenarios de la historia, en su orden natural: se abre la disputa y
 * dirección recibe la tarea con importe y fecha límite; la evidencia enlaza al
 * Dashboard de Stripe; se cierra y el `Payment` refleja el resultado.
 *
 * El cuarto, que no está escrito en Gherkin pero decide si esto funciona en
 * producción: los tres eventos del ciclo escriben la MISMA fila y ninguna
 * reentrega abre una segunda tarea.
 */

const SLUG = "e2e-stripe-disputes";

let orgId = "";
let centerA = "";
let centerB = "";
let memberA = "";
let ownerId = "";
let directorAId = "";
let directorBId = "";

async function makeUser(tag: string, role: "OWNER" | "CENTER_DIRECTOR", centerId: string | null) {
  const email = `${SLUG}-${tag}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const user = await prisma.user.create({
    data: { orgId, identityId: identity.id, name: tag, email, role, centerId },
  });
  return user.id;
}

async function makePayment(suffix: string, amountCents = 4900, memberId = memberA) {
  return prisma.payment.create({
    data: {
      orgId,
      memberId,
      amountCents,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripePaymentIntentId: `pi_${SLUG}_${suffix}`,
    },
  });
}

function dispute(over: Partial<Stripe.Dispute> & { id: string }): Stripe.Dispute {
  return {
    amount: 4900,
    status: "needs_response",
    reason: "fraudulent",
    evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 },
    ...over,
  } as Stripe.Dispute;
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.notification.deleteMany({ where: { orgId: org.id } });
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
  orgId = (await prisma.organization.create({ data: { name: "Disputas", slug: SLUG } })).id;
  centerA = (await prisma.center.create({ data: { orgId, name: "A", slug: `${SLUG}-a` } })).id;
  centerB = (await prisma.center.create({ data: { orgId, name: "B", slug: `${SLUG}-b` } })).id;
  memberA = (
    await prisma.member.create({
      data: { orgId, primaryCenterId: centerA, firstName: "Socio", lastName: "A", email: `${SLUG}-a@example.com` },
    })
  ).id;
  ownerId = await makeUser("owner", "OWNER", null);
  directorAId = await makeUser("director-a", "CENTER_DIRECTOR", centerA);
  directorBId = await makeUser("director-b", "CENTER_DIRECTOR", centerB);
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Escenario: disputa abierta
// ---------------------------------------------------------------------------

test("disputa abierta: se crea la tarea para dirección con importe y evidence_details.due_by", async () => {
  const pago = await makePayment("abierta", 4900);
  const dueBy = Math.floor(new Date("2026-10-01T23:59:59Z").getTime() / 1000);

  const resultado = await reconcileDispute(
    orgId,
    dispute({
      id: `dp_${SLUG}_abierta`,
      payment_intent: pago.stripePaymentIntentId!,
      amount: 4900,
      reason: "product_not_received",
      evidence_details: { due_by: dueBy } as Stripe.Dispute.EvidenceDetails,
    }),
    "charge.dispute.created"
  );
  assert.deepEqual(resultado, { ok: true });

  const fila = await prisma.paymentDispute.findUniqueOrThrow({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: `dp_${SLUG}_abierta` } },
  });
  assert.equal(fila.paymentId, pago.id);
  assert.equal(fila.amountCents, 4900);
  assert.equal(fila.status, "NEEDS_RESPONSE");
  assert.equal(fila.reason, "product_not_received");
  assert.equal(fila.evidenceDueBy?.getTime(), dueBy * 1000);
  assert.equal(fila.closedAt, null);

  const tareas = await prisma.notification.findMany({
    where: { orgId, entityType: "PaymentDispute", entityId: fila.id },
    select: { recipientUserId: true, title: true, priority: true, dueDate: true, resolvedAt: true },
  });

  // Dirección de organización siempre; la de centro, solo la del centro del socio.
  const destinatarios = tareas.map((t) => t.recipientUserId).sort();
  assert.deepEqual(destinatarios, [ownerId, directorAId].sort());
  assert.equal(
    destinatarios.includes(directorBId),
    false,
    "la dirección de otro centro no puede ver el nombre de este socio"
  );

  const tarea = tareas[0];
  assert.match(tarea.title, /49,00/, "el importe tiene que estar en la tarea");
  assert.equal(tarea.priority, "ALTA");
  assert.equal(tarea.dueDate?.getTime(), dueBy * 1000, "la fecha límite de la tarea es la de la evidencia");
  assert.equal(tarea.resolvedAt, null);

  const traza = await prisma.auditLog.findFirst({
    where: { orgId, entityType: "PaymentDispute", entityId: fila.id, action: DISPUTE_AUDIT_OPENED },
  });
  assert.ok(traza, "la apertura de la disputa no ha dejado traza");
});

test("disputa abierta: sin cobro local es reintentable, no un evento consumido", async () => {
  const resultado = await reconcileDispute(
    orgId,
    dispute({ id: `dp_${SLUG}_fantasma`, payment_intent: `pi_${SLUG}_no_existe` }),
    "charge.dispute.created"
  );
  assert.equal(resultado.ok, false);
  assert.equal(resultado.ok === false && resultado.retry, true);
});

test("los tres eventos del ciclo escriben la misma fila y no duplican la tarea", async () => {
  const pago = await makePayment("ciclo", 6000);
  const disputeId = `dp_${SLUG}_ciclo`;
  const pi = pago.stripePaymentIntentId!;

  await reconcileDispute(orgId, dispute({ id: disputeId, payment_intent: pi, amount: 6000 }), "charge.dispute.created");
  await reconcileDispute(
    orgId,
    dispute({ id: disputeId, payment_intent: pi, amount: 6000, status: "under_review" }),
    "charge.dispute.updated"
  );
  // Reentrega del mismo `updated`: la deduplicación por `event.id` la para
  // antes, pero el módulo tiene que aguantarla igual.
  await reconcileDispute(
    orgId,
    dispute({ id: disputeId, payment_intent: pi, amount: 6000, status: "under_review" }),
    "charge.dispute.updated"
  );

  const filas = await prisma.paymentDispute.findMany({ where: { orgId, stripeDisputeId: disputeId } });
  assert.equal(filas.length, 1, "la unicidad (orgId, stripeDisputeId) es lo que hace idempotente el ciclo");
  assert.equal(filas[0].status, "UNDER_REVIEW");

  const tareas = await prisma.notification.findMany({
    where: { orgId, entityType: "PaymentDispute", entityId: filas[0].id },
  });
  assert.equal(tareas.length, 2, "una tarea por persona de dirección, no una por evento");
});

// ---------------------------------------------------------------------------
// Escenario: aportar evidencia
// ---------------------------------------------------------------------------

test("aportar evidencia: el enlace apunta a la disputa en la cuenta CONECTADA", () => {
  // La cuenta va en la ruta: sin ella el enlace abre el Dashboard de Apta,
  // donde esa disputa no existe.
  assert.equal(
    stripeDisputeUrl("acct_gimnasio", "dp_1", true),
    "https://dashboard.stripe.com/acct_gimnasio/disputes/dp_1"
  );
  // En modo prueba el Dashboard sirve las disputas por otra URL.
  assert.equal(
    stripeDisputeUrl("acct_gimnasio", "dp_1", false),
    "https://dashboard.stripe.com/acct_gimnasio/test/disputes/dp_1"
  );
});

// ---------------------------------------------------------------------------
// Escenario: resolución
// ---------------------------------------------------------------------------

test("resolución perdida: la tarea se cierra y el Payment deja de contar como cobrado", async () => {
  const pago = await makePayment("perdida", 4900);
  const disputeId = `dp_${SLUG}_perdida`;
  const pi = pago.stripePaymentIntentId!;

  await reconcileDispute(orgId, dispute({ id: disputeId, payment_intent: pi }), "charge.dispute.created");
  const resultado = await reconcileDispute(
    orgId,
    dispute({ id: disputeId, payment_intent: pi, status: "lost" }),
    "charge.dispute.closed"
  );
  assert.deepEqual(resultado, { ok: true });

  const fila = await prisma.paymentDispute.findUniqueOrThrow({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: disputeId } },
  });
  assert.equal(fila.status, "LOST");
  assert.ok(fila.closedAt, "una disputa cerrada tiene fecha de cierre");

  const abiertas = await prisma.notification.count({
    where: { orgId, entityType: "PaymentDispute", entityId: fila.id, resolvedAt: null },
  });
  assert.equal(abiertas, 0, "cerrada la disputa, la tarea no tiene trabajo detrás");

  // El dinero no está: dejarlo en PAID haría que el panel contara un ingreso
  // que el banco ya se llevó.
  const tras = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(tras.status, "REFUNDED");
  assert.equal(tras.refundedAmountCents, 4900);
  assert.match(tras.refundReason ?? "", /[Cc]ontracargo/);
  // Y no hay refund detrás: es lo que distingue un contracargo de una devolución.
  assert.equal(tras.stripeRefundId, null);

  const traza = await prisma.auditLog.findFirst({
    where: { orgId, entityType: "PaymentDispute", entityId: fila.id, action: DISPUTE_AUDIT_CLOSED },
  });
  assert.ok(traza);
});

test("resolución ganada: el cobro no se toca", async () => {
  const pago = await makePayment("ganada", 3000);
  const disputeId = `dp_${SLUG}_ganada`;
  const pi = pago.stripePaymentIntentId!;

  await reconcileDispute(orgId, dispute({ id: disputeId, payment_intent: pi, amount: 3000 }), "charge.dispute.created");
  await reconcileDispute(
    orgId,
    dispute({ id: disputeId, payment_intent: pi, amount: 3000, status: "won" }),
    "charge.dispute.closed"
  );

  const tras = await prisma.payment.findUniqueOrThrow({ where: { id: pago.id } });
  assert.equal(tras.status, "PAID", "el dinero se queda donde estaba");
  assert.equal(tras.refundedAmountCents, null);

  const fila = await prisma.paymentDispute.findUniqueOrThrow({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: disputeId } },
  });
  assert.equal(fila.status, "WON");

  // Un `updated` que llegue DESPUÉS del cierre no puede reabrirla.
  const cerradaEn = fila.closedAt;
  await reconcileDispute(
    orgId,
    dispute({ id: disputeId, payment_intent: pi, amount: 3000, status: "won" }),
    "charge.dispute.updated"
  );
  const luego = await prisma.paymentDispute.findUniqueOrThrow({
    where: { orgId_stripeDisputeId: { orgId, stripeDisputeId: disputeId } },
  });
  assert.deepEqual(luego.closedAt, cerradaEn);
});

test("mapa de estados: los avisos tempranos cuentan como lo que son, y lo desconocido no se inventa", () => {
  assert.equal(mapDisputeStatus("needs_response"), "NEEDS_RESPONSE");
  assert.equal(mapDisputeStatus("warning_needs_response"), "NEEDS_RESPONSE");
  assert.equal(mapDisputeStatus("under_review"), "UNDER_REVIEW");
  assert.equal(mapDisputeStatus("warning_under_review"), "UNDER_REVIEW");
  assert.equal(mapDisputeStatus("won"), "WON");
  assert.equal(mapDisputeStatus("warning_closed"), "WON");
  // Stripe la frenó antes de llegar al banco: no hay dinero perdido.
  assert.equal(mapDisputeStatus("prevented"), "WON");
  assert.equal(mapDisputeStatus("lost"), "LOST");
  assert.equal(mapDisputeStatus("un_estado_que_stripe_añada_mañana" as Stripe.Dispute.Status), null);
});

// ---------------------------------------------------------------------------
// Ámbito de centro
// ---------------------------------------------------------------------------

test("ámbito de centro: una disputa de otro centro no se ve", async () => {
  const todas = await listDisputes(orgId);
  assert.ok(todas.length > 0);

  // Todos los socios de esta prueba son del centro A.
  const desdeA = await listDisputes(orgId, [centerA]);
  assert.equal(desdeA.length, todas.length);

  const desdeB = await listDisputes(orgId, [centerB]);
  assert.equal(desdeB.length, 0);
});
