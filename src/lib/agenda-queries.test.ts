import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { bookSessionForMemberAsStaff } from "@/lib/agenda-queries";
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
