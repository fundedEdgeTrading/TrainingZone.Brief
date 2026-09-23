import test from "node:test";
import assert from "node:assert/strict";

import { aiGenerationGate, demoOrgSlugs, isDemoOrgSlug } from "@/lib/ai/dpa";

/**
 * PROD-05 · En producción, sin AI_DEMO_ORG_SLUGS no hay organizaciones de demo.
 *
 * Antes la lista vacía caía a ["training-zone"] en cualquier entorno. En
 * producción, un gimnasio REAL que se diera de alta con el slug
 * "training-zone" —es el nombre del centro piloto— saltaba la puerta del DPA
 * (D-C5) y sus socios pasaban por la IA sin contrato firmado.
 */

test("PROD-05 · producción sin AI_DEMO_ORG_SLUGS → lista vacía", () => {
  assert.deepEqual(demoOrgSlugs({ NODE_ENV: "production" }), []);
  assert.deepEqual(demoOrgSlugs({ NODE_ENV: "production", AI_DEMO_ORG_SLUGS: "   " }), []);
  assert.equal(isDemoOrgSlug("training-zone", { NODE_ENV: "production" }), false);
});

test("PROD-05 · producción sin DPA ni lista: training-zone también queda bloqueada", () => {
  const gate = aiGenerationGate({ slug: "training-zone" }, new Date(), { NODE_ENV: "production" });
  assert.equal(gate.allowed, false);
});

test("PROD-05 · producción con lista explícita la respeta", () => {
  const env = { NODE_ENV: "production", AI_DEMO_ORG_SLUGS: "demo-a, demo-b" };
  assert.deepEqual(demoOrgSlugs(env), ["demo-a", "demo-b"]);
  assert.equal(aiGenerationGate({ slug: "demo-a" }, new Date(), env).allowed, true);
});

test("PROD-05 · fuera de producción se mantiene el valor por defecto de la semilla", () => {
  assert.deepEqual(demoOrgSlugs({ NODE_ENV: "development" }), ["training-zone"]);
  assert.deepEqual(demoOrgSlugs({}), ["training-zone"]);
});
