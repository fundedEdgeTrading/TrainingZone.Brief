import test from "node:test";
import assert from "node:assert/strict";
import { shouldNotifyVacancy } from "@/lib/session-booking";

/**
 * E2-09: no se anuncia "se ha liberado una plaza" de una clase que ya ocurrió.
 *
 * `cancelSessionBooking` no comprobaba que la sesión fuera futura, así que
 * limpiar el roster de una clase antigua mandaba correo a todos los socios con
 * bono de esa modalidad en el centro. `cancelBookingForMember` sí bloqueaba el
 * pasado; la vía de staff, no.
 */

const now = new Date("2026-09-06T18:00:00Z");
const full = { cancelledStatus: "BOOKED", wasFull: true, hasWaitlist: false, now };

test("sesión pasada: no se avisa a nadie", () => {
  const yesterday = new Date("2026-09-05T19:00:00Z");
  assert.equal(shouldNotifyVacancy({ ...full, startsAt: yesterday }), false);
});

test("sesión futura: el aviso sale como hasta ahora", () => {
  const tomorrow = new Date("2026-09-07T19:00:00Z");
  assert.equal(shouldNotifyVacancy({ ...full, startsAt: tomorrow }), true);
  // Y también cuando hay gente esperando aunque ya no estuviera llena.
  assert.equal(
    shouldNotifyVacancy({ ...full, wasFull: false, hasWaitlist: true, startsAt: tomorrow }),
    true
  );
});

test("sesión en curso: tampoco se avisa", () => {
  // Empezó hace media hora y todavía no ha terminado. La plaza ya no se puede
  // revender, así que el corte es el comienzo y no el final.
  const started = new Date("2026-09-06T17:30:00Z");
  assert.equal(shouldNotifyVacancy({ ...full, startsAt: started }), false);
  // Justo en el minuto de comienzo tampoco.
  assert.equal(shouldNotifyVacancy({ ...full, startsAt: now }), false);
});

test("salir de la lista de espera sigue sin liberar ninguna plaza", () => {
  const tomorrow = new Date("2026-09-07T19:00:00Z");
  assert.equal(
    shouldNotifyVacancy({ cancelledStatus: "WAITLISTED", wasFull: true, hasWaitlist: true, startsAt: tomorrow, now }),
    false
  );
});

test("una clase futura que no estaba llena y sin lista de espera no genera aviso", () => {
  const tomorrow = new Date("2026-09-07T19:00:00Z");
  assert.equal(
    shouldNotifyVacancy({ cancelledStatus: "BOOKED", wasFull: false, hasWaitlist: false, startsAt: tomorrow, now }),
    false
  );
});
