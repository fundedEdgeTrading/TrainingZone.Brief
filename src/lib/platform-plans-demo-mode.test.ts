import test from "node:test";
import assert from "node:assert/strict";

import { isDemoModeActive } from "@/lib/platform-plans";

/**
 * PROD-01 · el modo demo ya no se deduce de que falte STRIPE_SECRET_KEY: se
 * pide explícitamente, y en producción hace falta pedirlo dos veces.
 */

test("PROD-01 · sin DEMO_MODE el modo demo está apagado, aunque falte Stripe", () => {
  assert.equal(isDemoModeActive({}), false);
  assert.equal(isDemoModeActive({ NODE_ENV: "development" }), false);
  assert.equal(isDemoModeActive({ NODE_ENV: "production" }), false);
});

test("PROD-01 · DEMO_MODE=true lo enciende fuera de producción", () => {
  assert.equal(isDemoModeActive({ DEMO_MODE: "true", NODE_ENV: "development" }), true);
  assert.equal(isDemoModeActive({ DEMO_MODE: "true", NODE_ENV: "test" }), true);
  assert.equal(isDemoModeActive({ DEMO_MODE: "true" }), true);
});

test("PROD-01 · en producción DEMO_MODE solo no basta: hace falta ALLOW_DEMO_IN_PRODUCTION", () => {
  assert.equal(isDemoModeActive({ DEMO_MODE: "true", NODE_ENV: "production" }), false);
  assert.equal(
    isDemoModeActive({ DEMO_MODE: "true", NODE_ENV: "production", ALLOW_DEMO_IN_PRODUCTION: "true" }),
    true
  );
});

test("PROD-01 · ALLOW_DEMO_IN_PRODUCTION sin DEMO_MODE no enciende nada", () => {
  assert.equal(isDemoModeActive({ NODE_ENV: "production", ALLOW_DEMO_IN_PRODUCTION: "true" }), false);
});

test("PROD-01 · solo el literal \"true\" cuenta: '1', 'TRUE' o 'yes' no encienden la demo", () => {
  for (const value of ["1", "TRUE", "yes", "on", " true", ""]) {
    assert.equal(isDemoModeActive({ DEMO_MODE: value, NODE_ENV: "development" }), false, value);
  }
});
