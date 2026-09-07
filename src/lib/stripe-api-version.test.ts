import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import {
  PINNED_STRIPE_API_VERSION,
  SDK_STRIPE_API_VERSION,
  stripeApiVersionDrift,
  stripeClientOptions,
} from "@/lib/stripe-api-version";

/**
 * HU-ST-03 · `new Stripe(key)` heredaba la versión de API del paquete
 * instalado, declarado como `^22.3.2`. Ese es el mecanismo exacto que produjo
 * BUG-1: la API cambió el shape de `Invoice` y el plano 1 dejó de conciliar sin
 * que nadie tocara una línea.
 */

test("el cliente se construye con apiVersion explícita", () => {
  // No hace falta clave real: el constructor no llama a nada.
  const stripe = new Stripe("sk_test_para_construir", stripeClientOptions());
  assert.equal(stripe.getApiField("version"), PINNED_STRIPE_API_VERSION);
});

test("la versión fijada está documentada en .env.example", () => {
  const env = readFileSync(".env.example", "utf8");
  assert.ok(
    env.includes(PINNED_STRIPE_API_VERSION),
    "quien despliega tiene que poder saber contra qué versión de la API habla el código"
  );
});

test("un SDK con otra versión avisa, no rompe", () => {
  const drift = stripeApiVersionDrift("2027-01-01.eucalyptus");
  assert.ok(drift, "el desajuste tiene que producir un aviso");
  assert.ok(drift.includes(PINNED_STRIPE_API_VERSION));
  assert.ok(drift.includes("2027-01-01.eucalyptus"));
});

test("sin desajuste no hay aviso", () => {
  assert.equal(stripeApiVersionDrift(PINNED_STRIPE_API_VERSION), null);
});

test("hoy el SDK instalado coincide con la versión fijada", () => {
  // Si este test se pone rojo tras un `npm update`, es justo el aviso que la
  // historia pide: revisar el changelog y actualizar la constante a conciencia.
  assert.equal(SDK_STRIPE_API_VERSION, PINNED_STRIPE_API_VERSION);
});
