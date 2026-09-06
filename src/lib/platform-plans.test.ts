import test from "node:test";
import assert from "node:assert/strict";
import { PLATFORM_PLANS, getPlatformPlan, fundadorEnabled, fundadorClosesAt } from "@/lib/platform-plans";

/**
 * E6-04 · reempaquetado del catálogo. Esencial deja de ser el "tier me-too":
 * sube a 99 €, Avanzado baja a 129 € (distancia ~30 €), la IA entra en
 * Avanzado con cupo, y Élite deja de vender centros ilimitados.
 */

test("E6-04 · Esencial y Avanzado quedan a ~30 € de distancia", () => {
  const esencial = getPlatformPlan("esencial_mes")!;
  const avanzado = getPlatformPlan("avanzado_mes")!;
  assert.match(esencial.priceLabel, /99/);
  assert.match(avanzado.priceLabel, /129/);
});

test("E6-04 · la IA entra en Avanzado con cupo mensual, no en Esencial", () => {
  const esencial = getPlatformPlan("esencial_mes")!;
  const avanzado = getPlatformPlan("avanzado_mes")!;
  assert.equal(esencial.features.includes("ia_programacion"), false);
  assert.equal(avanzado.features.includes("ia_programacion"), true);
  assert.ok(avanzado.aiGenerationsPerMonth && avanzado.aiGenerationsPerMonth > 0);
});

test("E6-04 · Élite pasa a hasta 10 centros, con precio a medida por encima", () => {
  const elite = getPlatformPlan("elite_mes")!;
  assert.equal(elite.maxCenters, 10);
  assert.equal(elite.customPricingAboveLimit, true);
});

test("E6-04 · Fundador no lleva cupo de IA propio", () => {
  const fundador = getPlatformPlan("fundador")!;
  assert.equal(fundador.features.includes("ia_programacion"), false);
});

test("E6-04 · la oferta Fundador se apaga sola al pasar la fecha de cierre", () => {
  const original = { enabled: process.env.PLATFORM_PLAN_FUNDADOR_ENABLED, closes: process.env.PLATFORM_PLAN_FUNDADOR_CLOSES_AT };
  process.env.PLATFORM_PLAN_FUNDADOR_ENABLED = "true";

  process.env.PLATFORM_PLAN_FUNDADOR_CLOSES_AT = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(fundadorEnabled(), false, "con la fecha ya pasada, la oferta no está activa");

  process.env.PLATFORM_PLAN_FUNDADOR_CLOSES_AT = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(fundadorEnabled(), true);
  assert.ok(fundadorClosesAt());

  process.env.PLATFORM_PLAN_FUNDADOR_ENABLED = original.enabled;
  process.env.PLATFORM_PLAN_FUNDADOR_CLOSES_AT = original.closes;
});

test("E6-04 · un plan sigue teniendo un único código estable", () => {
  const codes = PLATFORM_PLANS.map((p) => p.code);
  assert.equal(new Set(codes).size, codes.length);
});
