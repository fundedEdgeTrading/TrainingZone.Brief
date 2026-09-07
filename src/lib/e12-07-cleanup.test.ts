import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * E12-07 · borrar código sin consumidor. `/portal/billing/checkout` y
 * `/portal/billing/portal` eran los dos únicos endpoints móviles sin
 * consumidor (E5-01/HU-ST-17 son web, no consumen la API móvil bearer-token);
 * `createCheckoutSession` era una línea que llamaba a `createMemberCheckout`
 * con un solo consumidor; `/portal/plan` y `/portal/comprar` duplicaban el
 * redirect de `next.config.ts` en su propio `page.tsx`.
 *
 * `/portal/billing/checkout` se recuperó al fusionar con HU-ST-10 (D-S3, otra
 * pista): esa historia la trata como una de las «dos puertas de compra de la
 * app» y le añade la guarda de `isSellableInApp`, así que sigue viva —
 * `plan-store-rules.test.ts` la protege. `/portal/billing/portal` (el Billing
 * Portal de Stripe) sigue sin consumidor y sigue borrada.
 */

test("E12-07 · el endpoint sin consumidor (portal/billing/portal) se ha borrado; checkout sigue vivo por HU-ST-10", () => {
  assert.equal(existsSync(join("src", "app", "api", "mobile", "v1", "portal", "billing", "portal")), false);
  assert.equal(existsSync(join("src", "app", "api", "mobile", "v1", "portal", "billing", "checkout")), true);
});

test("E12-07 · createCheckoutSession se elimina; su consumidor llama a createMemberCheckout", () => {
  const stripeCheckout = readFileSync(join("src", "lib", "stripe-checkout.ts"), "utf8");
  assert.doesNotMatch(stripeCheckout, /export async function createCheckoutSession/);

  const billingActions = readFileSync(join("src", "app", "(app)", "billing", "actions.ts"), "utf8");
  assert.match(billingActions, /createMemberCheckout\(/);
  assert.doesNotMatch(billingActions, /createCheckoutSession\(/);
});

test("E12-07 · /portal/plan y /portal/comprar pierden su redirect duplicado", () => {
  assert.equal(existsSync(join("src", "app", "(app)", "portal", "plan", "page.tsx")), false);
  assert.equal(existsSync(join("src", "app", "(app)", "portal", "comprar", "page.tsx")), false);

  const config = readFileSync("next.config.ts", "utf8");
  assert.match(config, /\/portal\/plan/);
  assert.match(config, /\/portal\/comprar/);
});

test("E12-07 · /portal/chat conserva su único redirect (no tenía duplicado)", () => {
  assert.equal(existsSync(join("src", "app", "(app)", "portal", "chat", "page.tsx")), true);
  const config = readFileSync("next.config.ts", "utf8");
  assert.doesNotMatch(config, /\/portal\/chat/);
});
