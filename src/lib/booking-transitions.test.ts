import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_BOOKING_TRANSITIONS,
  BookingTransitionError,
  assertBookingTransition,
  canBookingTransition,
  statusesThatCanReach,
} from "@/lib/booking-transitions";

/**
 * La máquina de estados de la reserva, que es la costura que consumen los
 * cuatro puntos de escritura del trimestre.
 */

test("una reserva cancelada no puede pasar a asistida", () => {
  assert.equal(canBookingTransition("CANCELLED", "ATTENDED"), false);
  assert.throws(() => assertBookingTransition("CANCELLED", "ATTENDED"), BookingTransitionError);
  // Y el mensaje dice qué hacer, no solo que no se puede.
  assert.match(
    new BookingTransitionError("CANCELLED", "ATTENDED").message,
    /reservarla de nuevo/,
    "cancelada es terminal: se vuelve a reservar, no se resucita"
  );
});

test("quien está en lista de espera no salta a asistida", () => {
  assert.equal(canBookingTransition("WAITLISTED", "ATTENDED"), false);
  assert.throws(() => assertBookingTransition("WAITLISTED", "ATTENDED"), /no tiene plaza/);
  // El camino legítimo pasa por la promoción, que sí comprueba aforo y bono.
  assert.equal(canBookingTransition("WAITLISTED", "BOOKED"), true);
});

test("lo que la agenda hace todos los días sigue estando permitido", () => {
  assert.equal(canBookingTransition("BOOKED", "ATTENDED"), true, "check-in");
  assert.equal(canBookingTransition("BOOKED", "NO_SHOW"), true, "falta");
  assert.equal(canBookingTransition("BOOKED", "CANCELLED"), true, "cancelación");
  assert.equal(canBookingTransition("WAITLISTED", "CANCELLED"), true, "salir de la lista");
  assert.equal(canBookingTransition("ATTENDED", "NO_SHOW"), true, "rectificar una asistencia");
  assert.equal(canBookingTransition("NO_SHOW", "ATTENDED"), true, "deshacer una falta");
  assert.equal(canBookingTransition("NO_SHOW", "BOOKED"), true, "deshacer una falta a reservada");
});

test("repetir el estado actual no es una transición y no revienta", () => {
  for (const status of Object.keys(ALLOWED_BOOKING_TRANSITIONS) as (keyof typeof ALLOWED_BOOKING_TRANSITIONS)[]) {
    assert.equal(canBookingTransition(status, status), true, `${status} → ${status}`);
  }
});

test("cancelada es terminal: no sale de ahí por ningún camino", () => {
  assert.deepEqual(ALLOWED_BOOKING_TRANSITIONS.CANCELLED, []);
});

test("los estados desde los que se alcanza un destino coinciden con el mapa", () => {
  // Es lo que se pasa a `where: { status: { in: … } }` en los UPDATE
  // condicionales, para que la carrera y la máquina de estados no sean dos
  // listas que haya que mantener a mano.
  assert.deepEqual(statusesThatCanReach("CANCELLED").sort(), ["BOOKED", "WAITLISTED"]);
  assert.deepEqual(statusesThatCanReach("ATTENDED").sort(), ["BOOKED", "NO_SHOW"]);
  assert.deepEqual(statusesThatCanReach("NO_SHOW").sort(), ["ATTENDED", "BOOKED"]);
  assert.equal(statusesThatCanReach("ATTENDED").includes("CANCELLED"), false);
  assert.equal(statusesThatCanReach("ATTENDED").includes("WAITLISTED"), false);
});
