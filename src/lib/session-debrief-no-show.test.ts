import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { setSessionDebrief, clearSessionDebrief } from "@/lib/session-debrief";
import { markBookingNoShow } from "@/lib/agenda-queries";
import {
  balanceOf,
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  createRegressionSession,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * QA-RES-04 · El debrief sobre una FALTA con devolución.
 *
 * `NO_SHOW → ATTENDED` es una transición legítima (rectificar un "No asistió"
 * puesto por error), pero el debrief la hacía con un UPDATE directo: la
 * reserva quedaba asistida, `noShowRefunded` seguía a `true` y la sesión que la
 * falta había devuelto al bono se quedaba en el bono. Asistencia gratis, y sin
 * asiento en el libro que lo explicara. Lo mismo al desmarcar (`NO_SHOW →
 * BOOKED`). Deshacer una falta pasa SIEMPRE por la misma rectificación que
 * `clearBookingNoShow`: asiento `CORRECTION` y bandera a `false`.
 *
 * Contra Postgres real, porque lo que se mide es el saldo y el libro.
 */

const TAG = "qa-res-04";
let org: RegressionOrg;
let sessionId: string;
let day: Date;
let seq = 0;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
  const session = await createRegressionSession(org, "clase-debrief", { capacity: 8, startsInHours: -2 });
  sessionId = session.id;
  day = session.day;
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

/** Reserva ya cobrada (saldo 5) y marcada como falta con devolución (saldo 6). */
async function refundedNoShow() {
  const socio = await createRegressionMember(org, TAG, ++seq, 5);
  const booking = await prisma.booking.create({
    data: { sessionId, occurrenceDate: day, memberId: socio.id, status: "BOOKED", subscriptionId: socio.subscriptionId },
  });
  const marked = await markBookingNoShow(org.orgId, booking.id, {
    reason: "JUSTIFIED",
    refundSession: true,
    actorUserId: org.trainerId,
  });
  assert.equal(marked.ok, true);
  assert.equal(await balanceOf(socio.subscriptionId), 6, "la falta devolvió la sesión");
  return { socio, bookingId: booking.id };
}

const actor = () => ({
  sessionId,
  orgId: org.orgId,
  actorUserId: org.trainerId,
  actorRole: "TRAINER" as const,
  actorCenterId: org.centerId,
});

const rowOf = (bookingId: string) =>
  prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { status: true, noShowRefunded: true, noShowReason: true },
  });

const corrections = (subscriptionId: string, bookingId: string) =>
  prisma.sessionLedger.findMany({ where: { subscriptionId, bookingId, reason: "CORRECTION" } });

test("QA-RES-04 · el debrief sobre una falta devuelta vuelve a descontar la sesión", async () => {
  const { socio, bookingId } = await refundedNoShow();

  const result = await setSessionDebrief({ ...actor(), bookingId, feeling: "GREEN" });
  assert.equal(result.ok, true);

  const row = await rowOf(bookingId);
  assert.equal(row.status, "ATTENDED");
  assert.equal(row.noShowRefunded, false, "la devolución de la falta ya no vale: asistió");
  assert.equal(row.noShowReason, null);
  assert.equal(await balanceOf(socio.subscriptionId), 5, "asistir con la sesión devuelta era asistir gratis");

  const entries = await corrections(socio.subscriptionId, bookingId);
  assert.equal(entries.length, 1, "el nuevo descuento deja su asiento de corrección");
  assert.equal(entries[0].delta, -1);
});

test("QA-RES-04 · repetir el debrief no descuenta dos veces", async () => {
  const { socio, bookingId } = await refundedNoShow();

  await setSessionDebrief({ ...actor(), bookingId, feeling: "GREEN" });
  await setSessionDebrief({ ...actor(), bookingId, feeling: "AMBER" });

  assert.equal(await balanceOf(socio.subscriptionId), 5);
  assert.equal((await corrections(socio.subscriptionId, bookingId)).length, 1);
});

test("QA-RES-04 · desmarcar una falta devuelta (NO_SHOW → BOOKED) también la rectifica", async () => {
  const { socio, bookingId } = await refundedNoShow();

  const result = await clearSessionDebrief({ ...actor(), bookingId });
  assert.equal(result.ok, true);

  const row = await rowOf(bookingId);
  assert.equal(row.status, "BOOKED");
  assert.equal(row.noShowRefunded, false);
  assert.equal(row.noShowReason, null);
  assert.equal(await balanceOf(socio.subscriptionId), 5);
  assert.equal((await corrections(socio.subscriptionId, bookingId)).length, 1);
});

test("QA-RES-04 · una falta SIN devolución pasa a asistida sin mover el saldo", async () => {
  const socio = await createRegressionMember(org, TAG, ++seq, 5);
  const booking = await prisma.booking.create({
    data: { sessionId, occurrenceDate: day, memberId: socio.id, status: "BOOKED", subscriptionId: socio.subscriptionId },
  });
  await markBookingNoShow(org.orgId, booking.id, { reason: "FORGOT", refundSession: false, actorUserId: org.trainerId });

  const result = await setSessionDebrief({ ...actor(), bookingId: booking.id, feeling: "GREEN" });
  assert.equal(result.ok, true);
  const row = await rowOf(booking.id);
  assert.equal(row.status, "ATTENDED");
  assert.equal(row.noShowReason, null, "una asistencia no arrastra el motivo de una falta");
  assert.equal(await balanceOf(socio.subscriptionId), 5);
  assert.equal(await prisma.sessionLedger.count({ where: { subscriptionId: socio.subscriptionId } }), 0);
});
