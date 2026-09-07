import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { readWebhookSecrets, verifyStripeWebhook } from "@/lib/stripe-webhook";

/**
 * HU-ST-01 · Verificación real de firma con los dos secretos. Se firma el
 * payload con `Stripe.webhooks.generateTestHeaderString` (el mismo HMAC que usa
 * Stripe de verdad), así que lo que se prueba aquí no es un doble: es la
 * criptografía que decidía si un flujo entero devolvía siempre 400.
 *
 * No hace falta clave real: `constructEvent` solo usa el secreto del endpoint.
 */
const stripe = new Stripe("sk_test_no_se_usa_para_verificar_firmas");

const PLATFORM_SECRET = "whsec_plataforma";
const CONNECT_SECRET = "whsec_connect";

function sign(payload: string, secret: string) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret });
}

function platformEvent() {
  return JSON.stringify({
    id: "evt_plataforma",
    type: "invoice.paid",
    data: { object: { id: "in_1" } },
  });
}

function connectEvent() {
  return JSON.stringify({
    id: "evt_connect",
    type: "invoice.paid",
    account: "acct_gimnasio",
    data: { object: { id: "in_2" } },
  });
}

test("un evento de plataforma valida con su secreto y se enruta al plano 1", () => {
  const payload = platformEvent();
  const result = verifyStripeWebhook(stripe, payload, sign(payload, PLATFORM_SECRET), {
    platform: PLATFORM_SECRET,
    connect: CONNECT_SECRET,
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.source, "platform");
  assert.equal(result.ok && result.event.id, "evt_plataforma");
});

test("un evento de cuenta conectada valida con el secreto de Connect", () => {
  const payload = connectEvent();
  // Antes de HU-ST-01 esto era el 400 permanente: el código solo conocía el
  // secreto de plataforma, así que TODO el plano 2 se rechazaba.
  const result = verifyStripeWebhook(stripe, payload, sign(payload, CONNECT_SECRET), {
    platform: PLATFORM_SECRET,
    connect: CONNECT_SECRET,
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok && result.source, "connect");
});

test("una firma que no valida con ninguno de los dos se rechaza", () => {
  const payload = connectEvent();
  const result = verifyStripeWebhook(stripe, payload, sign(payload, "whsec_de_otro"), {
    platform: PLATFORM_SECRET,
    connect: CONNECT_SECRET,
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.error, "Firma inválida.");
});

test("con un solo secreto configurado se sigue enrutando por event.account", () => {
  // Compatibilidad hacia atrás: el despliegue actual no tiene
  // STRIPE_CONNECT_WEBHOOK_SECRET y no debe dejar de funcionar.
  const connectPayload = connectEvent();
  const connectResult = verifyStripeWebhook(stripe, connectPayload, sign(connectPayload, PLATFORM_SECRET), {
    platform: PLATFORM_SECRET,
    connect: null,
  });
  assert.equal(connectResult.ok, true);
  assert.equal(connectResult.ok && connectResult.source, "connect");

  const platformPayload = platformEvent();
  const platformResult = verifyStripeWebhook(stripe, platformPayload, sign(platformPayload, PLATFORM_SECRET), {
    platform: PLATFORM_SECRET,
    connect: null,
  });
  assert.equal(platformResult.ok, true);
  assert.equal(platformResult.ok && platformResult.source, "platform");
});

test("solo el secreto de Connect configurado también basta", () => {
  const payload = connectEvent();
  const result = verifyStripeWebhook(stripe, payload, sign(payload, CONNECT_SECRET), {
    platform: null,
    connect: CONNECT_SECRET,
  });
  assert.equal(result.ok, true);
});

test("sin ningún secreto configurado no se verifica nada", () => {
  const payload = platformEvent();
  const result = verifyStripeWebhook(stripe, payload, sign(payload, PLATFORM_SECRET), {});
  assert.equal(result.ok, false);
});

test("readWebhookSecrets lee las dos variables de entorno", () => {
  const secrets = readWebhookSecrets({
    STRIPE_WEBHOOK_SECRET: PLATFORM_SECRET,
    STRIPE_CONNECT_WEBHOOK_SECRET: CONNECT_SECRET,
  });
  assert.equal(secrets.platform, PLATFORM_SECRET);
  assert.equal(secrets.connect, CONNECT_SECRET);
});
