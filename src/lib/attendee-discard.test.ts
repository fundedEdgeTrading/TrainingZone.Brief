import test from "node:test";
import assert from "node:assert/strict";
import { trainerDiscardEffect, TRAINER_DISCARD_WINDOW_HOURS } from "./attendee-discard";

// La regla que fija esta batería es la del rediseño de la app: el descarte del
// ENTRENADOR tiene ventana propia de 24 h, distinta de la cancelación del
// socio. Lo que se prueba es el efecto sobre el bono, que es lo que el
// entrenador lee en la hoja antes de confirmar.

const now = new Date("2026-09-04T10:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000);

const base = { now, status: "BOOKED" as const, hasSubscription: true };

test("fuera de las 24 h el descarte devuelve la sesión al bono", () => {
  const effect = trainerDiscardEffect({ ...base, startsAt: inHours(62) });
  assert.equal(effect.withinWindow, false);
  assert.equal(effect.refunds, true);
  assert.equal(effect.overridden, false);
});

test("justo en el límite de la ventana todavía devuelve", () => {
  const effect = trainerDiscardEffect({ ...base, startsAt: inHours(TRAINER_DISCARD_WINDOW_HOURS) });
  assert.equal(effect.withinWindow, false);
  assert.equal(effect.refunds, true);
});

test("dentro de las 24 h la sesión se consume", () => {
  const effect = trainerDiscardEffect({ ...base, startsAt: inHours(1.6) });
  assert.equal(effect.withinWindow, true);
  assert.equal(effect.refunds, false);
});

test("dentro de las 24 h se puede devolver a mano con permiso de ajuste de saldo", () => {
  const effect = trainerDiscardEffect({ ...base, startsAt: inHours(1.6), forceRefund: true, canForceRefund: true });
  assert.equal(effect.refunds, true);
  assert.equal(effect.overridden, true);
  assert.equal(effect.overrideDenied, false);
});

test("sin permiso de ajuste, pedir la devolución no la concede", () => {
  // Un entrenador raso puede pulsar el toggle en una app desactualizada: el
  // servidor no debe regalar la sesión, pero tampoco romper el descarte.
  const effect = trainerDiscardEffect({ ...base, startsAt: inHours(1.6), forceRefund: true, canForceRefund: false });
  assert.equal(effect.refunds, false);
  assert.equal(effect.overrideDenied, true);
});

test("la lista de espera nunca devuelve nada: no descontó bono", () => {
  const waiting = trainerDiscardEffect({ ...base, status: "WAITLISTED", startsAt: inHours(62) });
  assert.equal(waiting.refunds, false);

  const forced = trainerDiscardEffect({
    ...base,
    status: "WAITLISTED",
    startsAt: inHours(1),
    forceRefund: true,
    canForceRefund: true,
  });
  assert.equal(forced.refunds, false, "forzar sobre una lista de espera regalaría una sesión que nadie pagó");
});

test("una reserva sin bono asociado (hueco de EP) no devuelve ni consume", () => {
  // agenda-queries.ts::createEpSlot crea la reserva con subscriptionId null.
  const effect = trainerDiscardEffect({ ...base, hasSubscription: false, startsAt: inHours(62) });
  assert.equal(effect.refunds, false);
});

test("una sesión que ya empezó cuenta como dentro de la ventana", () => {
  const effect = trainerDiscardEffect({ ...base, startsAt: inHours(-2) });
  assert.equal(effect.withinWindow, true);
  assert.equal(effect.refunds, false);
});
