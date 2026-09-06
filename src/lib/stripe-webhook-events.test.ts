import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventProcessed,
} from "@/lib/stripe-webhook-events";

/**
 * HU-ST-05 · Stripe entrega AL MENOS una vez. Lo que se prueba aquí es el
 * contrato de los tres escenarios de la historia: la primera entrega se procesa
 * y queda sellada; la reentrega no se reprocesa; y un procesado que falla NO
 * queda marcado, para que el reintento de Stripe lo vuelva a coger.
 */

const PREFIJO = "evt_e2e-webhook-events";

function evento(tag: string, account: string | null = null): Stripe.Event {
  return {
    id: `${PREFIJO}-${tag}`,
    type: "invoice.paid",
    ...(account ? { account } : {}),
  } as unknown as Stripe.Event;
}

async function cleanup() {
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: PREFIJO } } });
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("la primera entrega se reserva y deja la fila con id, tipo y cuenta", async () => {
  const event = evento("primera", "acct_gimnasio");

  const claim = await claimStripeEvent(event);
  assert.equal(claim.claimed, true);

  const fila = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(fila.type, "invoice.paid");
  assert.equal(fila.account, "acct_gimnasio");
  assert.equal(fila.processedAt, null, "todavía no ha terminado de procesarse");

  await markStripeEventProcessed(event.id);
  const sellada = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.notEqual(sellada.processedAt, null);
});

test("un evento de plataforma se guarda sin cuenta conectada", async () => {
  const event = evento("plataforma");
  await claimStripeEvent(event);
  const fila = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(fila.account, null);
});

test("la reentrega de un evento ya procesado no se reprocesa", async () => {
  const event = evento("reentrega");
  assert.equal((await claimStripeEvent(event)).claimed, true);
  await markStripeEventProcessed(event.id);

  const segunda = await claimStripeEvent(event);
  assert.equal(segunda.claimed, false);
  assert.equal(segunda.claimed === false && segunda.reason, "processed");
});

test("una entrega simultánea del mismo evento no procesa en paralelo", async () => {
  const event = evento("simultanea");
  assert.equal((await claimStripeEvent(event)).claimed, true);

  // Sin marcar como procesado y recién recibido: es la otra mitad de una doble
  // entrega, no un reintento.
  const segunda = await claimStripeEvent(event);
  assert.equal(segunda.claimed, false);
  assert.equal(segunda.claimed === false && segunda.reason, "in-flight");
});

test("un procesado que falla NO queda marcado y el reintento lo vuelve a coger", async () => {
  const event = evento("fallido");
  assert.equal((await claimStripeEvent(event)).claimed, true);

  await markStripeEventFailed(event.id, "Suscripción sub_x aún no existe localmente.");

  const fila = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(fila.processedAt, null, "un fallo no puede darse por consumido");
  assert.match(fila.lastError ?? "", /aún no existe localmente/);

  // El reintento de Stripe llega minutos después: se simula envejeciendo la
  // recepción por debajo del margen de concurrencia.
  await prisma.stripeWebhookEvent.update({
    where: { id: event.id },
    data: { receivedAt: new Date(Date.now() - 10 * 60_000) },
  });

  const reintento = await claimStripeEvent(event);
  assert.equal(reintento.claimed, true, "el reintento de Stripe tiene que poder procesarlo");
});

test("el motivo del fallo se recorta para caber en la columna", async () => {
  const event = evento("error-largo");
  await claimStripeEvent(event);
  await markStripeEventFailed(event.id, "x".repeat(2000));

  const fila = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(fila.lastError?.length, 500);
});
