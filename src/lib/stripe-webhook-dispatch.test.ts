import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/stripe/webhook/route";

// La ruta lee las dos variables EN CADA PETICIÓN (`getStripeClient()` y
// `readWebhookSecrets()` las consultan al llamarlas, no al importarlas), así
// que basta con fijarlas antes de la primera entrega. No se pisan las del
// entorno si ya vienen puestas.
process.env.STRIPE_SECRET_KEY ||= "sk_test_despachador_lote2";
process.env.STRIPE_CONNECT_WEBHOOK_SECRET ||= "whsec_connect_lote2";

/**
 * Lote 2 · Cableado del despachador de webhook (S1).
 *
 * Cinco pistas necesitaban añadir casos al `switch` de
 * `api/stripe/webhook/route.ts`. Están todos puestos de una vez, y esto es lo
 * que comprueba que siguen puestos: que cada evento nuevo entra, se enruta al
 * módulo de su pista y sale con 200 —hoy contra módulos vacíos, y mañana igual
 * cuando cada pista rellene el suyo—.
 *
 * Lo que NO se prueba aquí es qué hace cada módulo: eso es de cada pista. Lo
 * que se prueba es la costura: firma real, deduplicación por `event.id` y
 * enrutado.
 */

const CONNECT_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET!;
const SLUG = "e2e-despachador-lote2";
const ACCOUNT_ID = `acct_${SLUG}`;
const PREFIJO_EVENTO = `evt_${SLUG}`;

/** Los ocho tipos que S1 añade al `switch`, con el módulo al que delegan. */
const CASOS_NUEVOS: Array<{ type: string; modulo: string; objeto: Record<string, unknown> }> = [
  // HU-ST-20 → stripe-refunds.ts (P2)
  { type: "charge.refunded", modulo: "stripe-refunds", objeto: { id: "ch_1", amount_refunded: 500, refunded: false } },
  { type: "credit_note.created", modulo: "stripe-refunds", objeto: { id: "cn_1", invoice: "in_1" } },
  { type: "credit_note.updated", modulo: "stripe-refunds", objeto: { id: "cn_1", invoice: "in_1" } },
  { type: "credit_note.voided", modulo: "stripe-refunds", objeto: { id: "cn_1", invoice: "in_1" } },
  // HU-ST-21 → stripe-disputes.ts (P2)
  {
    type: "charge.dispute.created",
    modulo: "stripe-disputes",
    objeto: { id: "dp_1", amount: 4900, status: "needs_response", evidence_details: { due_by: 1790000000 } },
  },
  { type: "charge.dispute.updated", modulo: "stripe-disputes", objeto: { id: "dp_1", amount: 4900, status: "under_review" } },
  { type: "charge.dispute.closed", modulo: "stripe-disputes", objeto: { id: "dp_1", amount: 4900, status: "lost" } },
  // HU-ST-23 → stripe-balance.ts (P4)
  { type: "payout.paid", modulo: "stripe-balance", objeto: { id: "po_1", amount: 9500, arrival_date: 1789000000, status: "paid" } },
  { type: "payout.failed", modulo: "stripe-balance", objeto: { id: "po_1", amount: 9500, status: "failed" } },
  // HU-ST-12 → stripe-mandate.ts (P1)
  { type: "mandate.updated", modulo: "stripe-mandate", objeto: { id: "mandate_1", status: "active" } },
  {
    type: "checkout.session.async_payment_succeeded",
    modulo: "stripe-mandate",
    objeto: { id: "cs_1", payment_status: "paid" },
  },
  {
    type: "checkout.session.async_payment_failed",
    modulo: "stripe-mandate",
    objeto: { id: "cs_1", payment_status: "unpaid" },
  },
  // HU-ST-16 → sepa-prenotification.ts (P1)
  { type: "invoice.upcoming", modulo: "sepa-prenotification", objeto: { amount_due: 4900, period_end: 1789000000 } },
  // HU-ST-22 → stripe-card-expiry.ts (P1)
  { type: "customer.source.expiring", modulo: "stripe-card-expiry", objeto: { id: "card_1", exp_month: 10 } },
  { type: "payment_method.automatically_updated", modulo: "stripe-card-expiry", objeto: { id: "pm_1" } },
];

function cuerpo(eventId: string, type: string, objeto: Record<string, unknown>): string {
  return JSON.stringify({
    id: eventId,
    type,
    account: ACCOUNT_ID, // plano 2: cuenta conectada del gimnasio
    data: { object: objeto },
  });
}

/** Firma con el HMAC real de Stripe: la verificación de HU-ST-01 no se saltea. */
async function entregar(eventId: string, type: string, objeto: Record<string, unknown>) {
  const payload = cuerpo(eventId, type, objeto);
  const firma = Stripe.webhooks.generateTestHeaderString({ payload, secret: CONNECT_SECRET });
  const req = new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": firma, "content-type": "application/json" },
  });
  const res = await POST(req);
  return { status: res.status, body: (await res.json()) as { ok: boolean; deduplicated?: string } };
}

/** Captura lo que registran los módulos vacíos, que es su contrato de hoy. */
function capturarLog() {
  const real = console.info;
  const lineas: string[] = [];
  console.info = (...args: unknown[]) => {
    lineas.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  return {
    lineas,
    restaurar: () => {
      console.info = real;
    },
  };
}

async function cleanup() {
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: PREFIJO_EVENTO } } });
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.stripeAccount.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Despachador lote 2", slug: SLUG } });
  await prisma.stripeAccount.create({
    data: { orgId: org.id, accountId: ACCOUNT_ID, chargesEnabled: true, payoutsEnabled: true },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("los ocho tipos nuevos entran por el despachador y salen con 200", async () => {
  for (const caso of CASOS_NUEVOS) {
    const eventId = `${PREFIJO_EVENTO}-ruta-${caso.type}`;
    const captura = capturarLog();
    let resultado;
    try {
      resultado = await entregar(eventId, caso.type, caso.objeto);
    } finally {
      captura.restaurar();
    }

    assert.equal(resultado.status, 200, `${caso.type} tenía que procesarse`);
    assert.equal(resultado.body.ok, true);
    assert.equal(
      captura.lineas.some((linea) => linea.includes(`[${caso.modulo}]`)),
      true,
      `${caso.type} tenía que delegar en ${caso.modulo}.ts, y registró: ${captura.lineas.join(" | ")}`
    );
  }
});

test("cada tipo nuevo queda sellado como procesado, no consumido en silencio", async () => {
  // Que la fila tenga `processedAt` es lo que distingue "se ha atendido" de
  // "se ha tragado": un 500 la dejaría sin sellar para que Stripe reintente.
  for (const caso of CASOS_NUEVOS) {
    const fila = await prisma.stripeWebhookEvent.findUnique({
      where: { id: `${PREFIJO_EVENTO}-ruta-${caso.type}` },
    });
    assert.notEqual(fila, null, `${caso.type} no dejó rastro en StripeWebhookEvent`);
    assert.notEqual(fila?.processedAt, null, `${caso.type} quedó sin sellar`);
    assert.equal(fila?.account, ACCOUNT_ID, "se guarda la cuenta conectada que lo originó");
  }
});

test("HU-ST-05: la deduplicación por event.id envuelve también a los casos nuevos", async () => {
  const eventId = `${PREFIJO_EVENTO}-dedup`;
  const objeto = { id: "dp_dedup", amount: 4900, status: "needs_response" };

  const primera = await entregar(eventId, "charge.dispute.created", objeto);
  assert.equal(primera.status, 200);
  assert.equal(primera.body.deduplicated, undefined, "la primera entrega sí se procesa");

  // La reentrega no vuelve a entrar: si lo hiciera, una disputa contaría dos
  // veces igual que antes contaba dos veces un cobro.
  const segunda = await entregar(eventId, "charge.dispute.created", objeto);
  assert.equal(segunda.status, 200);
  assert.equal(segunda.body.deduplicated, "processed");
});

test("HU-ST-01: la verificación de firma no se ha tocado — una firma inválida sigue siendo 400", async () => {
  const payload = cuerpo(`${PREFIJO_EVENTO}-firma`, "payout.paid", { id: "po_x", amount: 1 });
  const firmaDeOtro = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_secreto_que_no_es" });
  const req = new NextRequest("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: payload,
    headers: { "stripe-signature": firmaDeOtro },
  });

  const res = await POST(req);
  assert.equal(res.status, 400);

  const fila = await prisma.stripeWebhookEvent.findUnique({ where: { id: `${PREFIJO_EVENTO}-firma` } });
  assert.equal(fila, null, "un evento sin firma válida no llega ni a reservarse");
});

test("un evento de una cuenta conectada que no conocemos se descarta sin escribir nada", async () => {
  // Aislamiento del plano 2: `resolveConnectOrgId` no la encuentra y el caso
  // rompe antes de llamar al módulo. Sigue siendo 200: para Stripe está visto.
  const captura = capturarLog();
  let resultado;
  try {
    const payload = JSON.stringify({
      id: `${PREFIJO_EVENTO}-huerfano`,
      type: "payout.paid",
      account: "acct_de_otra_galaxia",
      data: { object: { id: "po_9", amount: 1 } },
    });
    const firma = Stripe.webhooks.generateTestHeaderString({ payload, secret: CONNECT_SECRET });
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: payload,
        headers: { "stripe-signature": firma },
      })
    );
    resultado = { status: res.status, body: (await res.json()) as { ok: boolean } };
  } finally {
    captura.restaurar();
  }

  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.ok, true);
  assert.equal(
    captura.lineas.some((linea) => linea.includes("[stripe-balance]")),
    false,
    "una cuenta que no es nuestra no llega al módulo de la pista"
  );

  await prisma.stripeWebhookEvent.deleteMany({ where: { id: `${PREFIJO_EVENTO}-huerfano` } });
});

test("un tipo que nadie maneja sigue cayendo en el default sin romper", async () => {
  const resultado = await entregar(`${PREFIJO_EVENTO}-desconocido`, "radar.early_fraud_warning.created", {
    id: "issfr_1",
  });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.ok, true);
});

test("estructural: los seis módulos del lote existen y el switch delega en todos", async () => {
  // Esta es la prueba que protege el reparto: si alguien borra un `case` o
  // renombra un módulo, siete pistas se quedan sin su enganche.
  const { readFileSync } = await import("node:fs");
  const ruta = readFileSync("src/app/api/stripe/webhook/route.ts", "utf8");

  for (const modulo of [
    "@/lib/stripe-refunds",
    "@/lib/stripe-disputes",
    "@/lib/stripe-balance",
    "@/lib/stripe-mandate",
    "@/lib/sepa-prenotification",
    "@/lib/stripe-card-expiry",
  ]) {
    assert.equal(ruta.includes(modulo), true, `el despachador ya no importa ${modulo}`);
  }

  for (const caso of CASOS_NUEVOS) {
    assert.equal(ruta.includes(`case "${caso.type}"`), true, `falta el case de ${caso.type}`);
  }
});
