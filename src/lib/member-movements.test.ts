import "dotenv/config";
import { readFileSync } from "node:fs";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { chargeSession, refundSession } from "@/lib/session-ledger";
import { getMemberMovements } from "@/lib/member-movements";

/**
 * E5-09 · Historial de asistencia y de movimientos del bono en la web.
 *
 * Los cuatro escenarios Gherkin, contra la MISMA función que usan tanto
 * `/portal/movimientos` (web) como `/api/mobile/v1/portal/consumption`
 * (app) — no una reproducción suya.
 */

const SUFFIX = "e2e-member-movements-test";

async function wipe() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const { id: orgId } of orgs) {
    await prisma.sessionLedger.deleteMany({ where: { orgId } });
    await prisma.booking.deleteMany({ where: { session: { orgId } } });
    await prisma.classSession.deleteMany({ where: { orgId } });
    await prisma.subscription.deleteMany({ where: { member: { orgId } } });
    await prisma.member.deleteMany({ where: { orgId } });
    await prisma.membershipPlan.deleteMany({ where: { orgId } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(wipe);
after(async () => {
  await wipe();
  await prisma.$disconnect();
});

async function fixture(tag: string) {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Movimientos ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Bono 10 sesiones", type: "SESSION_PACK", sessionsIncluded: 10, priceCents: 10000 },
  });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Marta", lastName: tag, email: `${slug}@example.com` },
  });
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date(),
      priceCents: 10000,
      status: "ACTIVE",
      sessionsIncluded: 10,
      sessionsRemaining: 10,
    },
  });
  // Alta del bono: la fila que explica de dónde sale el saldo inicial, igual
  // que en la vida real (RB-VENTA-008). Sin ella el cuadre no podría dar.
  await prisma.sessionLedger.create({
    data: { orgId: org.id, subscriptionId: subscription.id, delta: 10, balanceAfter: 10, reason: "PURCHASE" },
  });
  const session = await prisma.classSession.create({
    data: {
      orgId: org.id,
      centerId: center.id,
      name: "Yoga",
      classType: "Grupo reducido",
      date: new Date(2026, 8, 8),
      startTime: "10:00",
      endTime: "11:00",
      capacity: 8,
    },
  });
  return { orgId: org.id, memberId: member.id, subscriptionId: subscription.id, sessionId: session.id };
}

test("escenario movimientos: fecha, signo, motivo y saldo salen del SessionLedger", async () => {
  const f = await fixture("movimientos");
  const bookingId = await prisma.booking
    .create({ data: { sessionId: f.sessionId, memberId: f.memberId, subscriptionId: f.subscriptionId, status: "ATTENDED", occurrenceDate: new Date(2026, 8, 8) } })
    .then((b) => b.id);
  await prisma.$transaction((tx) => chargeSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId, reason: "BOOKING" }));

  const view = await getMemberMovements(f.memberId);
  assert.equal(view.movements.length, 2); // alta + reserva

  const charge = view.movements.find((m) => m.delta === -1);
  assert.ok(charge, "la reserva tiene que dejar un movimiento de -1");
  assert.equal(charge?.concept, "Yoga");
  assert.equal(charge?.reason, "Sesión reservada");
  assert.equal(charge?.balanceAfter, 9);
  assert.equal(charge?.tone, "neutral");
  assert.match(charge?.day ?? "", /^\d{4}-\d{2}-\d{2}$/);

  const purchase = view.movements.find((m) => m.delta === 10);
  assert.equal(purchase?.reason, null); // sin reserva detrás: no hay booking.session que nombrar
  assert.equal(purchase?.concept, "Alta del bono");
});

test("escenario asistencia: asistida, cancelada y no presentada, con su efecto sobre el bono", async () => {
  const f = await fixture("asistencia");

  // Asistida: se queda con el cargo, sin devolución.
  const attended = await prisma.booking.create({
    data: { sessionId: f.sessionId, memberId: f.memberId, subscriptionId: f.subscriptionId, status: "ATTENDED", occurrenceDate: new Date(2026, 8, 8) },
  });
  await prisma.$transaction((tx) => chargeSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: attended.id, reason: "BOOKING" }));

  // Cancelada: cargo + devolución por cancelación, la reserva pierde el bono de origen.
  const cancelled = await prisma.booking.create({
    data: { sessionId: f.sessionId, memberId: f.memberId, subscriptionId: f.subscriptionId, status: "BOOKED", occurrenceDate: new Date(2026, 8, 8) },
  });
  await prisma.$transaction((tx) => chargeSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: cancelled.id, reason: "BOOKING" }));
  await prisma.booking.update({ where: { id: cancelled.id }, data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null } });
  await prisma.$transaction((tx) => refundSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: cancelled.id, reason: "CANCELLATION" }));

  // No presentada, con devolución (RB-RES-009 lo deja a criterio del centro).
  const noShow = await prisma.booking.create({
    data: { sessionId: f.sessionId, memberId: f.memberId, subscriptionId: f.subscriptionId, status: "BOOKED", occurrenceDate: new Date(2026, 8, 8) },
  });
  await prisma.$transaction((tx) => chargeSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: noShow.id, reason: "BOOKING" }));
  await prisma.booking.update({ where: { id: noShow.id }, data: { status: "NO_SHOW", noShowRefunded: true } });
  await prisma.$transaction((tx) => refundSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: noShow.id, reason: "NO_SHOW_REFUND" }));

  const view = await getMemberMovements(f.memberId);

  const attendedMovements = view.movements.filter((m) => m.bookingStatus === "ATTENDED");
  assert.equal(attendedMovements.length, 1);
  assert.equal(attendedMovements[0].delta, -1, "asistida: solo el cargo, ninguna devolución");

  const cancelledMovements = view.movements.filter((m) => m.bookingStatus === "CANCELLED");
  assert.equal(cancelledMovements.length, 2, "cancelada: el cargo original y su devolución");
  assert.deepEqual(cancelledMovements.map((m) => m.delta).sort(), [-1, 1]);

  const noShowMovements = view.movements.filter((m) => m.bookingStatus === "NO_SHOW");
  assert.equal(noShowMovements.length, 2, "no presentada con devolución: cargo y devolución");
  assert.deepEqual(noShowMovements.map((m) => m.delta).sort(), [-1, 1]);
});

test("escenario cuadre: el saldo de arriba coincide con la suma de los movimientos de abajo", async () => {
  const f = await fixture("cuadre");

  const b1 = await prisma.booking.create({
    data: { sessionId: f.sessionId, memberId: f.memberId, subscriptionId: f.subscriptionId, status: "ATTENDED", occurrenceDate: new Date(2026, 8, 8) },
  });
  await prisma.$transaction((tx) => chargeSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: b1.id, reason: "BOOKING" }));

  const b2 = await prisma.booking.create({
    data: { sessionId: f.sessionId, memberId: f.memberId, subscriptionId: f.subscriptionId, status: "BOOKED", occurrenceDate: new Date(2026, 8, 8) },
  });
  await prisma.$transaction((tx) => chargeSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: b2.id, reason: "BOOKING" }));
  await prisma.booking.update({ where: { id: b2.id }, data: { status: "CANCELLED", cancelledAt: new Date(), subscriptionId: null } });
  await prisma.$transaction((tx) => refundSession(tx, { orgId: f.orgId, subscriptionId: f.subscriptionId, bookingId: b2.id, reason: "CANCELLATION" }));

  const view = await getMemberMovements(f.memberId);
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: f.subscriptionId } });

  const summedBalance = view.movements.reduce((sum, m) => sum + m.delta, 0);
  assert.equal(summedBalance, sub.sessionsRemaining, "la suma de los movimientos listados tiene que dar el saldo real");
  assert.equal(view.balances[0]?.remaining, summedBalance, "y el saldo mostrado arriba es ese mismo número");
});

test("escenario paridad con la app: la web y la API móvil consumen la misma función", () => {
  const mobileRoute = readFileSync("src/app/api/mobile/v1/portal/consumption/route.ts", "utf8");
  assert.match(mobileRoute, /import \{ getMemberMovements \} from "@\/lib\/member-movements"/);
  assert.match(mobileRoute, /getMemberMovements\(auth\.member\.id\)/);

  const webPage = readFileSync("src/app/(app)/portal/movimientos/page.tsx", "utf8");
  assert.match(webPage, /import \{ getMemberMovements \} from "@\/lib\/member-movements"/);
  assert.match(webPage, /getMemberMovements\(member\.id\)/);
});
