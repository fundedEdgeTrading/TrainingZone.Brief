import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { setSessionDebrief } from "@/lib/session-debrief";
import { statusesEndingAt } from "@/lib/booking-transitions";
import { markBookingNoShow, clearBookingNoShow } from "@/lib/agenda-queries";
import {
  cleanupRegressionOrgs,
  createRegressionMember,
  createRegressionOrg,
  createRegressionSession,
  type RegressionOrg,
} from "@/lib/e7-07-fixture";

/**
 * E7-07 · U2 — `CANCELLED` y `WAITLISTED` no llegan a `ATTENDED` por ninguna de
 * las vías de escritura.
 *
 * `booking-transitions-writes.test.ts` ya fija la regla en su forma pura. Este
 * fichero la comprueba donde importa: sobre filas reales, después de llamar a
 * las funciones que escriben.
 *
 * Lo verificado antes del arreglo, y que ninguna prueba pura habría cazado
 * porque no era la tabla de transiciones lo que fallaba sino que nadie la
 * consultaba: reserva → cancelación (bono devuelto) →
 * `POST /trainer/brief/<id>/debrief` → `{"saved":true}` y en la base
 * `status = ATTENDED` con `checkedInAt` puesto. La sesión reaparecía como
 * asistida en el histórico del socio, con el bono ya devuelto: asistencia
 * gratis y estadística falseada.
 *
 * Las cuatro vías comparten dos defensas, y las dos se prueban aquí: el
 * `checkBookingTransition` que corta antes de escribir, y la lista de estados
 * que viaja DENTRO del `where` del UPDATE, para que una cancelación llegada
 * entre la lectura y la escritura tampoco cuele.
 */

const TAG = "u2-estados";
let org: RegressionOrg;
let sessionId: string;
let day: Date;

before(async () => {
  await cleanupRegressionOrgs(TAG);
  org = await createRegressionOrg(TAG);
  const session = await createRegressionSession(org, "clase-estados", { capacity: 4, startsInHours: -2 });
  sessionId = session.id;
  day = session.day;
});

after(async () => {
  await cleanupRegressionOrgs(TAG);
  await prisma.$disconnect();
});

let seq = 0;

/** Reserva en el estado de partida que se quiera probar. */
async function bookingWith(status: "CANCELLED" | "WAITLISTED" | "BOOKED") {
  const socio = await createRegressionMember(org, TAG, ++seq, 5);
  const booking = await prisma.booking.create({
    data: {
      sessionId,
      occurrenceDate: day,
      memberId: socio.id,
      status,
      // Una cancelada ya soltó su bono; una en cola nunca lo tuvo.
      subscriptionId: status === "BOOKED" ? socio.subscriptionId : null,
      waitlistPosition: status === "WAITLISTED" ? 1 : null,
    },
  });
  return { socio, bookingId: booking.id };
}

const statusOf = (bookingId: string) =>
  prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { status: true, checkedInAt: true },
  });

/** El debrief tal y como lo llama la web y, con los mismos argumentos, la app. */
function debriefFor(bookingId: string) {
  return setSessionDebrief({
    bookingId,
    sessionId,
    orgId: org.orgId,
    actorUserId: org.trainerId,
    actorRole: "TRAINER",
    actorCenterId: org.centerId,
    feeling: "GREEN",
  });
}

test("U2 · el debrief no marca asistencia sobre una reserva cancelada", async () => {
  const { bookingId } = await bookingWith("CANCELLED");

  const result = await debriefFor(bookingId);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.status, 409);

  const after = await statusOf(bookingId);
  assert.equal(after.status, "CANCELLED", "esta es la fila que se llevaba a ATTENDED con un 200");
  assert.equal(after.checkedInAt, null);
  assert.equal(await prisma.sessionDebrief.count({ where: { bookingId } }), 0, "ni se guarda el debrief");
});

test("U2 · tampoco sobre una reserva en lista de espera", async () => {
  const { bookingId } = await bookingWith("WAITLISTED");

  const result = await debriefFor(bookingId);
  assert.equal(result.ok, false);

  const after = await statusOf(bookingId);
  assert.equal(after.status, "WAITLISTED", "nunca ocupó plaza: entrar por aquí se salta aforo y bono");
  assert.equal(after.checkedInAt, null);
});

test("U2 · sobre una reserva viva sí funciona: el corte es el estado, no el debrief", async () => {
  const { bookingId } = await bookingWith("BOOKED");

  const result = await debriefFor(bookingId);
  assert.equal(result.ok, true);

  const after = await statusOf(bookingId);
  assert.equal(after.status, "ATTENDED");
  assert.notEqual(after.checkedInAt, null);
  assert.equal(await prisma.sessionDebrief.count({ where: { bookingId } }), 1);
});

test("U2 · el check-in tampoco resucita una cancelada, ni cuando la carrera lo intenta", async () => {
  const { bookingId } = await bookingWith("CANCELLED");

  // `toggleCheckIn` es un Server Action y necesita sesión de navegador, pero su
  // defensa de fondo —la que aguanta si la reserva se cancela ENTRE la lectura
  // y la escritura— es esta condición dentro del propio UPDATE. Se ejecuta tal
  // cual: si `statusesEndingAt` dejara entrar CANCELLED, aquí cambiaría la fila.
  const applied = await prisma.booking.updateMany({
    where: { id: bookingId, status: { in: statusesEndingAt("ATTENDED") } },
    data: { status: "ATTENDED", checkedInAt: new Date() },
  });

  assert.equal(applied.count, 0, "el UPDATE condicional no encuentra a quién aplicarse");
  assert.equal((await statusOf(bookingId)).status, "CANCELLED");
});

test("U2 · marcar falta parte de una reserva viva, no de una cancelada", async () => {
  const { bookingId: cancelada } = await bookingWith("CANCELLED");
  const noShow = await markBookingNoShow(org.orgId, cancelada, {
    reason: "FORGOT",
    refundSession: false,
    actorUserId: org.trainerId,
  });
  assert.equal(noShow.ok, false);
  assert.equal((await statusOf(cancelada)).status, "CANCELLED");

  const { bookingId: viva } = await bookingWith("BOOKED");
  const marked = await markBookingNoShow(org.orgId, viva, {
    reason: "FORGOT",
    refundSession: false,
    actorUserId: org.trainerId,
  });
  assert.equal(marked.ok, true);
  assert.equal((await statusOf(viva)).status, "NO_SHOW");
});

test("U2 · deshacer una falta parte de una falta", async () => {
  const { bookingId } = await bookingWith("CANCELLED");
  const cleared = await clearBookingNoShow(org.orgId, bookingId, "ATTENDED", org.trainerId);
  assert.equal(cleared.ok, false, "el mismo bookingId llevaba a ATTENDED una reserva cancelada");
  assert.equal((await statusOf(bookingId)).status, "CANCELLED");
});

test("U2 · desmarcar una asistencia vuelve a BOOKED, nunca a CANCELLED", async () => {
  const { bookingId } = await bookingWith("BOOKED");
  await debriefFor(bookingId);
  assert.equal((await statusOf(bookingId)).status, "ATTENDED");

  // El toggle solo alterna entre ATTENDED y BOOKED: cancelar es otra cosa
  // —libera plaza y devuelve bono— y quitar un check no es ninguna de las dos.
  const applied = await prisma.booking.updateMany({
    where: { id: bookingId, status: { in: statusesEndingAt("BOOKED") } },
    data: { status: "BOOKED", checkedInAt: null },
  });
  assert.equal(applied.count, 1);
  const after = await statusOf(bookingId);
  assert.equal(after.status, "BOOKED");
  assert.equal(after.checkedInAt, null);
});
