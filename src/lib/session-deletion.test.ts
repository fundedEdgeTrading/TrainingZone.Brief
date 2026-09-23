import test from "node:test";
import assert from "node:assert/strict";
import type { BookingStatus } from "@prisma/client";
import { bookingsInDeletionScope, describeSettledAttendance, planSessionDeletion } from "@/lib/session-deletion";

/**
 * E2-01 / RB-AGENDA-010. Lo que fija esta batería es QUÉ hay que deshacer al
 * borrar una sesión: el fallo verificado por reproducción era que no se
 * deshacía nada (bono a 5 → reserva de staff → 4 → el entrenador borra la
 * sesión → seguía en 4, sin `AuditLog` ni aviso).
 */

let counter = 0;
const NOW = new Date("2026-09-23T10:00:00Z");
const FUTURE = new Date("2026-09-30T10:00:00Z");
const PAST = new Date("2026-09-16T10:00:00Z");
function booking(status: BookingStatus, subscriptionId: string | null = "sub-1", startsAt = FUTURE) {
  counter++;
  return { id: `bk-${counter}`, memberId: `m-${counter}`, status, subscriptionId, startsAt };
}

test("sesión con reservas activas: los tres recuperan su sesión de bono y se les avisa", () => {
  const bookings = [booking("BOOKED"), booking("BOOKED"), booking("BOOKED")];
  const plan = planSessionDeletion(bookings, NOW);

  assert.equal(plan.refunds.length, 3, "tres reservas con bono consumido, tres devoluciones");
  assert.deepEqual(
    plan.refunds.map((b) => b.id),
    bookings.map((b) => b.id)
  );
  // El aviso es para los tres: la clase ha dejado de existir.
  assert.equal(plan.notify.length, 3);
  assert.equal(plan.settled.length, 0);
});

test("una reserva ya cancelada no devuelve el bono por segunda vez", () => {
  // Al cancelar se devolvió la sesión y la reserva se quedó sin bono
  // (`subscriptionId = null`): devolver aquí sería la segunda devolución.
  const plan = planSessionDeletion([booking("CANCELLED", null), booking("BOOKED")], NOW);
  assert.equal(plan.refunds.length, 1);
  assert.equal(plan.refunds[0]!.status, "BOOKED");
  assert.equal(plan.notify.length, 1, "a quien ya canceló no hay clase que anunciarle");
});

test("la lista de espera no devuelve nada y no rompe la operación", () => {
  const waiting = booking("WAITLISTED", null);
  const plan = planSessionDeletion([waiting, booking("BOOKED")], NOW);

  assert.equal(plan.refunds.length, 1, "esperar no consumió bono: no hay nada que devolver");
  assert.ok(!plan.refunds.some((b) => b.id === waiting.id));
  // Pero sí se le avisa: se ha quedado sin la clase igual.
  assert.ok(plan.notify.some((b) => b.id === waiting.id));
});

test("una WAITLISTED con subscriptionId colgado tampoco devuelve", () => {
  // Defensa contra datos sucios: la lista de espera nunca descuenta, así que
  // el criterio es el estado Y el bono, no el bono a secas.
  const plan = planSessionDeletion([booking("WAITLISTED", "sub-9")], NOW);
  assert.equal(plan.refunds.length, 0);
});

test("las asistencias ya registradas no se devuelven y obligan a confirmar", () => {
  const plan = planSessionDeletion([booking("ATTENDED"), booking("NO_SHOW"), booking("BOOKED")], NOW);

  assert.equal(plan.settled.length, 2, "asistida y falta son histórico consumido");
  assert.equal(plan.refunds.length, 1, "solo la reserva viva devuelve");
  assert.ok(!plan.refunds.some((b) => b.status === "ATTENDED"));
  // Y el texto de la confirmación dice cuántas son y qué se pierde.
  assert.match(describeSettledAttendance(2), /2 asistencias ya registradas/);
  assert.match(describeSettledAttendance(1), /una asistencia ya registrada/);
  assert.match(describeSettledAttendance(2), /no devuelve esas sesiones al bono/);
});

test("una sesión sin reservas se borra sin devolver ni avisar a nadie", () => {
  const plan = planSessionDeletion([], NOW);
  assert.deepEqual(plan, { refunds: [], notify: [], settled: [] });
});

// --- QA-RES-05 · borrar con alcance: solo lo futuro se devuelve y se avisa ----

test("QA-RES-05 · una reserva de una ocurrencia ya pasada ni se devuelve ni se avisa", () => {
  const past = booking("BOOKED", "sub-1", PAST);
  const future = booking("BOOKED", "sub-2", FUTURE);
  const plan = planSessionDeletion([past, future], NOW);

  assert.deepEqual(plan.refunds.map((b) => b.id), [future.id], "la sesión de la semana pasada ya se dio o se perdió");
  assert.deepEqual(plan.notify.map((b) => b.id), [future.id], "no se anuncia la cancelación de algo que ya pasó");
});

test("QA-RES-05 · una ocurrencia en curso cuenta como pasada", () => {
  const plan = planSessionDeletion([booking("BOOKED", "sub-1", NOW)], NOW);
  assert.equal(plan.refunds.length, 0);
  assert.equal(plan.notify.length, 0);
});

test("QA-RES-05 · el alcance decide qué reservas se deshacen", () => {
  const day = (d: number) => new Date(2026, 8, d);
  const bookings = [9, 16, 23, 30].map((d) => ({ id: `d${d}`, occurrenceDate: day(d) }));

  assert.deepEqual(bookingsInDeletionScope(bookings, "single", day(23)).map((b) => b.id), ["d23"]);
  assert.deepEqual(bookingsInDeletionScope(bookings, "future", day(23)).map((b) => b.id), ["d23", "d30"]);
  assert.deepEqual(bookingsInDeletionScope(bookings, "all", day(23)).map((b) => b.id), ["d9", "d16", "d23", "d30"]);
});
