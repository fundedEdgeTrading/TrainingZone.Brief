import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";

import { PLATFORM_PLANS } from "@/lib/platform-plans";
import {
  PLATFORM_PRICE_CATALOG_TAG,
  formatPlatformPrice,
  platformLookupKey,
  resolvePlatformPriceCatalog,
} from "@/lib/platform-price-catalog";

/**
 * Catálogo de plataforma sincronizado con Stripe: los precios se localizan por
 * lookup key y lo archivado deja de ofrecerse, sin variables `STRIPE_PRICE_*`.
 */

function price(overrides: Partial<Stripe.Price> & { lookup_key: string }): Stripe.Price {
  return {
    id: `price_${overrides.lookup_key}`,
    object: "price",
    active: true,
    currency: "eur",
    type: "recurring",
    unit_amount: 9900,
    recurring: { interval: "month", interval_count: 1 } as Stripe.Price.Recurring,
    product: { id: "prod_1", object: "product", active: true } as Stripe.Product,
    ...overrides,
  } as Stripe.Price;
}

const quiet = <T>(fn: () => T): T => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.warn = warn;
  }
};

test("cada plan tiene una lookup key única y estable (apta_<código>)", () => {
  const keys = PLATFORM_PLANS.map((p) => platformLookupKey(p.code));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(platformLookupKey("avanzado_mes"), "apta_avanzado_mes");
  // `prices.list({ lookup_keys })` admite como mucho 10.
  assert.ok(keys.length <= 10);
});

test("un precio activo con su lookup key entra en el catálogo con el importe de Stripe", () => {
  const catalog = resolvePlatformPriceCatalog([price({ lookup_key: "apta_avanzado_mes", unit_amount: 13900 })]);
  assert.deepEqual(catalog.avanzado_mes, { priceId: "price_apta_avanzado_mes", unitAmount: 13900, currency: "eur" });
  assert.equal(catalog.esencial_mes, undefined, "sin precio en Stripe, el plan no se ofrece");
});

test("precio o producto archivado en Stripe: el plan desaparece", () => {
  const catalog = resolvePlatformPriceCatalog([
    price({ lookup_key: "apta_esencial_mes", active: false }),
    price({ lookup_key: "apta_avanzado_mes", product: { id: "prod_2", object: "product", active: false } as Stripe.Product }),
    price({ lookup_key: "apta_elite_mes", product: { id: "prod_3", object: "product", deleted: true } as Stripe.DeletedProduct }),
  ]);
  assert.deepEqual(catalog, {});
});

test("periodicidad o importe que no casan con el plan: no se ofrece", () => {
  const catalog = quiet(() =>
    resolvePlatformPriceCatalog([
      // Un "mensual" que en Stripe es anual cobraría otra cosa de la que dice la tarjeta.
      price({ lookup_key: "apta_esencial_mes", recurring: { interval: "year", interval_count: 1 } as Stripe.Price.Recurring }),
      price({ lookup_key: "apta_avanzado_mes", recurring: { interval: "month", interval_count: 3 } as Stripe.Price.Recurring }),
      price({ lookup_key: "apta_elite_mes", unit_amount: null }),
      // Fundador es pago único: un precio recurrente no vale.
      price({ lookup_key: "apta_fundador" }),
    ])
  );
  assert.deepEqual(catalog, {});
});

test("anual y pago único se reconocen por su tipo de precio", () => {
  const catalog = resolvePlatformPriceCatalog([
    price({ lookup_key: "apta_elite_ano", unit_amount: 279000, recurring: { interval: "year", interval_count: 1 } as Stripe.Price.Recurring }),
    price({ lookup_key: "apta_fundador", type: "one_time", recurring: null, unit_amount: 399000 }),
  ]);
  assert.equal(catalog.elite_ano?.unitAmount, 279000);
  assert.equal(catalog.fundador?.unitAmount, 399000);
});

test("el precio se enseña tal cual lo cobra Stripe", () => {
  const nbsp = (s: string) => s.replace(/ /g, " ");
  assert.equal(nbsp(formatPlatformPrice({ unitAmount: 9900, currency: "eur" }, "month")), "99 €/mes");
  assert.equal(nbsp(formatPlatformPrice({ unitAmount: 129000, currency: "eur" }, "year")), "1.290 €/año");
  assert.equal(nbsp(formatPlatformPrice({ unitAmount: 399000, currency: "eur" }, "lifetime")), "3.990 € pago único");
  assert.equal(nbsp(formatPlatformPrice({ unitAmount: 4950, currency: "eur" }, "month")), "49,50 €/mes");
});

test("el webhook invalida la caché del catálogo ante cambios de producto o precio", () => {
  const route = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");
  for (const event of ["product.updated", "product.deleted", "price.created", "price.updated", "price.deleted"]) {
    assert.match(route, new RegExp(`case "${event.replace(".", "\\.")}"`), `el webhook no escucha ${event}`);
  }
  assert.match(route, /revalidateTag\(PLATFORM_PRICE_CATALOG_TAG, \{ expire: 0 \}\)/);
  assert.equal(PLATFORM_PRICE_CATALOG_TAG, "platform-price-catalog");
});

test("el checkout resuelve el precio contra Stripe, no contra el entorno", () => {
  const billing = readFileSync("src/lib/platform-billing.ts", "utf8");
  assert.doesNotMatch(billing, /process\.env\.STRIPE_PRICE_/);
  assert.equal((billing.match(/await resolvePlatformPriceId\(plan\)/g) ?? []).length, 2);
});
