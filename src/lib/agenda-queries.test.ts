import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { bookSessionForMemberAsStaff, createEpSlot, saveSession } from "@/lib/agenda-queries";
import {
  balanceOf,
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  createRegressionSession,
  type RegressionMember,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * Pista agenda-staff (QA-RES-*): lo que la agenda de staff hace con el bono, el
 * aforo y el calendario cuando reserva, cancela, mueve o borra en nombre de
 * otro. Contra Postgres real, como `agenda-booking.test.ts`: lo que se protege
 * es lo que queda escrito (saldo, asiento del libro, filas de reserva), y eso
 * con un doble de la base no se ve.
 */

const TAG = "qa-res-staff";
let org: RegressionOrg;
let epPlanId: string;
let counter = 0;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.orgId, name: `Bono EP ${TAG}`, type: "PERSONAL_TRAINING", sessionsIncluded: 10, priceCents: 9000 },
  });
  epPlanId = plan.id;
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

/** Socio con bono de EP (el fixture común solo da bono de grupos). */
async function epMember(sessionsRemaining: number | null): Promise<RegressionMember> {
  counter++;
  const socio = await createRegressionMember(org, `${TAG}-ep`, counter, sessionsRemaining);
  await prisma.subscription.update({ where: { id: socio.subscriptionId }, data: { planId: epPlanId } });
  return socio;
}

/** Pasado mañana: fuera de cualquier ventana de cancelación y sin depender de la hora del runner. */
function dayAhead(days = 3) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function epInput(memberId: string | null, date = dayAhead()) {
  return {
    centerId: org.centerId,
    trainerId: org.trainerId,
    title: `EP ${TAG} ${++counter}`,
    type: "personal" as const,
    date,
    startTime: "10:00",
    endTime: "11:00",
    memberId,
    selfBookable: false,
    isTrial: false,
    recurrence: "NONE" as const,
    recUntil: null,
  };
}

const sessionsNamed = (name: string) => prisma.classSession.count({ where: { orgId: org.orgId, name } });

// --- QA-RES-01 · la reserva del campo "Socio" es una reserva de verdad --------

test("QA-RES-01 · asignar socio al crear un EP descuenta su bono y deja asiento", async () => {
  const socio = await epMember(5);
  const input = epInput(socio.id);

  const saved = await saveSession(org.orgId, input);
  assert.equal(saved.ok, true);

  const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: socio.id } });
  assert.equal(booking.status, "BOOKED");
  assert.equal(booking.subscriptionId, socio.subscriptionId, "la reserva recuerda de qué bono salió");
  assert.equal(await balanceOf(socio.subscriptionId), 4, "el EP agendado a mano también gasta sesión");
  const ledger = await prisma.sessionLedger.findMany({ where: { subscriptionId: socio.subscriptionId } });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]!.delta, -1);
});

test("QA-RES-01 · sin saldo, la sesión no se guarda a medias y el error llega", async () => {
  const socio = await epMember(0);
  const input = epInput(socio.id);

  const saved = await saveSession(org.orgId, input);
  assert.equal(saved.ok, false);
  assert.ok(!saved.ok && /no le quedan sesiones/.test(saved.error));
  assert.equal(await sessionsNamed(input.title), 0, "sin reserva no hay franja creada");
  assert.equal(await prisma.booking.count({ where: { memberId: socio.id } }), 0);
});

test("QA-RES-01 · un segundo socio no entra en un EP de una plaza ya ocupada", async () => {
  const [a, b] = [await epMember(5), await epMember(5)];
  const input = epInput(a.id);
  const created = await saveSession(org.orgId, input);
  assert.ok(created.ok);

  const edited = await saveSession(org.orgId, { ...input, id: created.session.id, memberId: b.id });
  assert.equal(edited.ok, false);
  assert.ok(!edited.ok && /completa/.test(edited.error));
  assert.equal(await prisma.booking.count({ where: { sessionId: created.session.id, status: "BOOKED" } }), 1);
  assert.equal(await balanceOf(b.subscriptionId), 5, "a quien no entra no se le cobra");
});

test("QA-RES-01 · el moroso no entra por el campo Socio", async () => {
  const socio = await epMember(5);
  await prisma.member.update({
    where: { id: socio.id },
    data: { state: "DELINQUENT", delinquentSince: new Date(Date.now() - 90 * 86_400_000) },
  });
  const input = epInput(socio.id);

  const saved = await saveSession(org.orgId, input);
  assert.equal(saved.ok, false);
  assert.equal(await sessionsNamed(input.title), 0);
  assert.equal(await balanceOf(socio.subscriptionId), 5);
});

test("QA-RES-01 · createEpSlot (app) cobra igual y no deja franja si falla", async () => {
  const socio = await epMember(3);
  const ok = await createEpSlot(org.orgId, {
    centerId: org.centerId,
    trainerId: org.trainerId,
    date: dayAhead(4),
    startTime: "09:00",
    durationMin: 60,
    selfBookable: false,
    memberId: socio.id,
  });
  assert.equal(ok.ok, true);
  const booking = await prisma.booking.findFirstOrThrow({ where: { memberId: socio.id } });
  assert.equal(booking.subscriptionId, socio.subscriptionId);
  assert.equal(await balanceOf(socio.subscriptionId), 2);

  const broke = await epMember(0);
  const before = await prisma.classSession.count({ where: { orgId: org.orgId } });
  const failed = await createEpSlot(org.orgId, {
    centerId: org.centerId,
    trainerId: org.trainerId,
    date: dayAhead(4),
    startTime: "12:00",
    durationMin: 60,
    selfBookable: false,
    memberId: broke.id,
  });
  assert.equal(failed.ok, false);
  assert.equal(await prisma.classSession.count({ where: { orgId: org.orgId } }), before);
});

// --- QA-RES-08 · el asiento del cobro apunta a su reserva ---------------------

test("QA-RES-08 · la reserva de staff deja el asiento del cobro enlazado a la reserva", async () => {
  const socio = await createRegressionMember(org, `${TAG}-ledger`, ++counter, 5);
  const session = await createRegressionSession(org, `grupo-ledger-${counter}`, { capacity: 4, startsInHours: 72 });

  const booked = await bookSessionForMemberAsStaff(org.orgId, {
    sessionId: session.id,
    memberId: socio.id,
    occurrenceDate: session.day,
  });
  assert.equal(booked.ok, true);

  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId: session.id, memberId: socio.id } });
  const entry = await prisma.sessionLedger.findFirstOrThrow({ where: { subscriptionId: socio.subscriptionId } });
  assert.equal(entry.bookingId, booking.id, "sin bookingId el asiento no se puede cuadrar con su reserva");
});
