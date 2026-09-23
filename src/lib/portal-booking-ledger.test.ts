import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { bookSessionForMember } from "@/lib/portal-queries";
import { isOperatingDay } from "@/app/(app)/agenda/agenda-utils";
import {
  balanceOf,
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * QA-RES-08 (portal) · R2: el socio reserva y el asiento `BOOKING` lleva el
 * `bookingId` de SU reserva.
 *
 * El portal cobraba antes de crear la reserva, así que el asiento se escribía
 * sin `bookingId`: el libro decía "sesión reservada" sin decir cuál, y la ficha
 * del bono no podía enlazar el consumo con la clase. Al reclamar la plaza desde
 * la lista de espera pasaba lo mismo, y además si otro se adelantaba se cobraba
 * y se devolvía (dos asientos) por una reserva que nunca cambió.
 */

const TAG = "qa-res-08";
let org: RegressionOrg;
let seq = 0;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

function nextBookableDay(): Date {
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1);
  while (!isOperatingDay(day)) day.setDate(day.getDate() + 1);
  return day;
}

const dateParam = (day: Date) =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

async function sessionWith(capacity: number) {
  const day = nextBookableDay();
  const session = await prisma.classSession.create({
    data: {
      orgId: org.orgId,
      centerId: org.centerId,
      trainerId: org.trainerId,
      name: `grupo-${++seq}`,
      classType: "Grupo reducido",
      date: day,
      startTime: "18:00",
      endTime: "19:00",
      capacity,
    },
  });
  return { sessionId: session.id, day };
}

async function memberForBooking(memberId: string) {
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: memberId },
    include: { subscriptions: { where: { status: "ACTIVE" }, include: { plan: true } } },
  });
  return {
    id: member.id,
    primaryCenterId: member.primaryCenterId,
    subscriptions: member.subscriptions.map((s) => ({
      id: s.id,
      status: s.status,
      centerId: s.centerId,
      sessionsRemaining: s.sessionsRemaining,
      plan: { type: s.plan.type },
    })),
  };
}

test("QA-RES-08 · R2: reservar desde el portal deja el asiento BOOKING con el bookingId de la reserva", async () => {
  const { sessionId, day } = await sessionWith(4);
  const socio = await createRegressionMember(org, TAG, ++seq, 5);

  const result = await bookSessionForMember(await memberForBooking(socio.id), sessionId, dateParam(day));
  assert.deepEqual(result, { ok: true, waitlisted: false });

  const booking = await prisma.booking.findFirstOrThrow({ where: { sessionId, memberId: socio.id } });
  assert.equal(booking.status, "BOOKED");
  assert.equal(booking.subscriptionId, socio.subscriptionId);
  assert.equal(await balanceOf(socio.subscriptionId), 4);

  const entries = await prisma.sessionLedger.findMany({ where: { subscriptionId: socio.subscriptionId } });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].reason, "BOOKING");
  assert.equal(entries[0].delta, -1);
  assert.equal(entries[0].bookingId, booking.id, "el consumo tiene que decir qué reserva lo provocó");
});

test("QA-RES-08 · reclamar la plaza desde la lista de espera cobra con el bookingId de esa reserva", async () => {
  const { sessionId, day } = await sessionWith(1);
  const dentro = await createRegressionMember(org, TAG, ++seq, 5);
  const esperando = await createRegressionMember(org, TAG, ++seq, 5);

  // Estaba llena; quien estaba dentro sale y deja el hueco libre.
  await prisma.booking.create({
    data: { sessionId, occurrenceDate: day, memberId: dentro.id, status: "CANCELLED" },
  });
  const waitlisted = await prisma.booking.create({
    data: { sessionId, occurrenceDate: day, memberId: esperando.id, status: "WAITLISTED", waitlistPosition: 1 },
  });

  const result = await bookSessionForMember(await memberForBooking(esperando.id), sessionId, dateParam(day));
  assert.deepEqual(result, { ok: true, waitlisted: false });

  const claimed = await prisma.booking.findUniqueOrThrow({ where: { id: waitlisted.id } });
  assert.equal(claimed.status, "BOOKED");
  assert.equal(claimed.subscriptionId, esperando.subscriptionId);
  assert.equal(await balanceOf(esperando.subscriptionId), 4);

  const entries = await prisma.sessionLedger.findMany({ where: { subscriptionId: esperando.subscriptionId } });
  assert.equal(entries.length, 1, "un reclamo es un asiento, no un cobro y una corrección");
  assert.equal(entries[0].reason, "BOOKING");
  assert.equal(entries[0].bookingId, waitlisted.id);
});

test("QA-RES-08 · entrar en lista de espera no cobra ni deja asiento", async () => {
  const { sessionId, day } = await sessionWith(1);
  const dentro = await createRegressionMember(org, TAG, ++seq, 5);
  const tarde = await createRegressionMember(org, TAG, ++seq, 5);
  await prisma.booking.create({
    data: { sessionId, occurrenceDate: day, memberId: dentro.id, status: "BOOKED", subscriptionId: dentro.subscriptionId },
  });

  const result = await bookSessionForMember(await memberForBooking(tarde.id), sessionId, dateParam(day));
  assert.deepEqual(result, { ok: true, waitlisted: true });
  assert.equal(await balanceOf(tarde.subscriptionId), 5);
  assert.equal(await prisma.sessionLedger.count({ where: { subscriptionId: tarde.subscriptionId } }), 0);
});
