import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E12-16 · /billing decía que la pasarela de pago online "queda fuera de
 * esta entrega" con el checkout de Stripe ya en la misma pantalla
 * (StripeCheckoutForm). El texto tiene que describir lo que la pantalla
 * hace de verdad.
 */

const SOURCE = readFileSync(join("src", "app", "(app)", "billing", "page.tsx"), "utf8");

test("E12-16 · el texto ya no dice que la pasarela de pago online no está prevista", () => {
  assert.doesNotMatch(SOURCE, /pasarela de pago online quedan? fuera de esta entrega/);
});

test("E12-16 · sigue siendo honesto sobre lo que de verdad falta (VERI*FACTU)", () => {
  assert.match(SOURCE, /VERI\*FACTU/);
});
