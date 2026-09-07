import test from "node:test";
import assert from "node:assert/strict";
import {
  checkBookingTransition,
  statusesEndingAt,
  statusesThatCanReach,
} from "@/lib/booking-transitions";

/**
 * E2-02 / RB-RES-010, visto desde los CUATRO puntos de escritura que la
 * consumen: el debrief de la web, el debrief de la app, el feedback de ejes de
 * la app y el check-in de `/agenda/session/[id]`.
 *
 * Lo verificado antes del arreglo: reserva → cancelación (`CANCELLED`,
 * `subscriptionId = null`, bono devuelto) → `POST /trainer/brief/<id>/debrief`
 * → `{"saved":true}` y en BD `status = ATTENDED` con `checkedInAt` puesto.
 * Ninguna de las cuatro vías miraba el estado de partida.
 *
 * Los cuatro sitios comprueban lo mismo de dos maneras a la vez, y por eso se
 * prueban juntas: `checkBookingTransition` corta antes de escribir, y
 * `statusesEndingAt` es la lista que viaja DENTRO del `where` del UPDATE, para
 * que una cancelación que llegue entre la lectura y la escritura tampoco cuele.
 */

test("marcar asistencia sobre una reserva cancelada se rechaza en las cuatro vías", () => {
  const check = checkBookingTransition("CANCELLED", "ATTENDED");
  assert.equal(check.ok, false);
  assert.ok(!check.ok && /reservarla de nuevo/.test(check.error));

  // Y la misma respuesta la da el UPDATE condicional: CANCELLED no está en la
  // lista, así que `updateMany` cuenta 0 y no se escribe ni el debrief.
  assert.ok(!statusesEndingAt("ATTENDED").includes("CANCELLED"));
});

test("el check-in sobre una reserva en lista de espera se rechaza", () => {
  // Nunca ocupó plaza ni consumió bono: saltar a ATTENDED la metería en una
  // sesión llena sin pasar por la promoción, que es la que mira aforo y bono.
  const check = checkBookingTransition("WAITLISTED", "ATTENDED");
  assert.equal(check.ok, false);
  assert.ok(!check.ok && /no tiene plaza/.test(check.error));
  assert.ok(!statusesEndingAt("ATTENDED").includes("WAITLISTED"));
});

test("una reserva viva sigue funcionando exactamente igual que hoy", () => {
  assert.deepEqual(checkBookingTransition("BOOKED", "ATTENDED"), { ok: true });
  // Volver a guardar el debrief de quien ya estaba marcado no es un cambio y
  // no puede fallar: es el guardado optimista por eje de la app.
  assert.deepEqual(checkBookingTransition("ATTENDED", "ATTENDED"), { ok: true });
  assert.deepEqual(statusesEndingAt("ATTENDED").sort(), ["ATTENDED", "BOOKED", "NO_SHOW"]);
});

test("desmarcar una asistencia vuelve a BOOKED, no a CANCELLED", () => {
  assert.deepEqual(checkBookingTransition("ATTENDED", "BOOKED"), { ok: true });
  // Y cancelar sigue siendo otra cosa: libera plaza y devuelve bono. Quitar un
  // check no es ninguna de las dos, así que esa puerta se queda cerrada desde
  // el propio toggle (que solo alterna entre ATTENDED y BOOKED).
  assert.ok(statusesEndingAt("BOOKED").includes("ATTENDED"));
  assert.ok(!statusesThatCanReach("ATTENDED").includes("CANCELLED"));
});

test("deshacer una falta parte de una falta", () => {
  // `clearBookingNoShow` no acotaba el estado: el mismo bookingId llevaba a
  // ATTENDED una reserva cancelada. Ahora solo se deshace lo que es NO_SHOW.
  assert.deepEqual(checkBookingTransition("NO_SHOW", "ATTENDED"), { ok: true });
  assert.deepEqual(checkBookingTransition("NO_SHOW", "BOOKED"), { ok: true });
  assert.equal(checkBookingTransition("CANCELLED", "BOOKED").ok, false);
});

test("marcar falta acota su estado de partida con la misma lista compartida", () => {
  // `markBookingNoShow` era la única vía que sí validaba; ahora la lista no es
  // un literal suyo, sale de la máquina de estados.
  assert.deepEqual(statusesEndingAt("NO_SHOW").sort(), ["ATTENDED", "BOOKED", "NO_SHOW"]);
  assert.ok(!statusesEndingAt("NO_SHOW").includes("CANCELLED"));
  assert.ok(!statusesEndingAt("NO_SHOW").includes("WAITLISTED"));
});
