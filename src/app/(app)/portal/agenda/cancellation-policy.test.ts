import test from "node:test";
import assert from "node:assert/strict";
import { cancellationPolicyLabel, cancellationPolicyShortLabel } from "./cancellation-policy";

/**
 * E5-05 — escenario principal: la tarjeta indica hasta cuándo se puede
 * cancelar sin penalización con el número REAL de horas del centro, no un
 * literal fijo. Mismo texto en la tarjeta y junto al botón de confirmar.
 */

test("usa el número real de horas del centro, no un literal fijo", () => {
  assert.equal(cancellationPolicyLabel(24), "Cancelación gratuita hasta 24h antes de la clase.");
  assert.equal(cancellationPolicyLabel(12), "Cancelación gratuita hasta 12h antes de la clase.");
});

test("la etiqueta corta junto al botón de confirmar dice lo mismo", () => {
  assert.equal(cancellationPolicyShortLabel(24), "Cancela gratis hasta 24h antes.");
});
