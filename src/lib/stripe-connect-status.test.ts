import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getConnectStatus } from "@/lib/stripe-connect";
import {
  buildConnectStatus,
  missingConnectEnvVars,
  translateDisabledReason,
  translateRequirement,
  translateRequirements,
  type ConnectAccountSnapshot,
} from "@/lib/stripe-connect-status";

/**
 * HU-ST-07 · La UI solo sabía "conectado" o "no conectado". El caso intermedio
 * —conectado pero con el KYC a medias, que es donde se atasca un gimnasio de
 * verdad— se veía igual que no haber empezado: el director pulsaba "Conectar"
 * otra vez y nadie le decía qué papel faltaba.
 */

const SLUG = "e2e-connect-status-test";

function snapshot(over: Partial<ConnectAccountSnapshot> = {}): ConnectAccountSnapshot {
  return {
    accountId: "acct_1",
    chargesEnabled: true,
    payoutsEnabled: true,
    currentlyDue: [],
    disabledReason: null,
    nextPayoutArrival: null,
    nextPayoutCents: null,
    ...over,
  };
}

test("una cuenta que aún no puede cobrar queda pendiente, no operativa", () => {
  const status = buildConnectStatus(
    snapshot({
      chargesEnabled: false,
      currentlyDue: ["individual.verification.document", "external_account"],
      disabledReason: "requirements.past_due",
    })
  );

  assert.equal(status.state, "pending");
  if (status.state !== "pending") return;
  assert.deepEqual(
    status.currentlyDue.map((r) => r.label),
    ["Una foto de tu DNI, NIE o pasaporte", "La cuenta bancaria donde quieres recibir el dinero"]
  );
  assert.match(status.disabledReason ?? "", /documentación vencida/);
});

test("los requisitos se traducen sin jerga y sin repetir", () => {
  // `dob.day`, `dob.month` y `dob.year` son tres códigos y UNA cosa que pedir.
  // Verlo tres veces hace pensar que hay tres problemas distintos.
  const requisitos = translateRequirements([
    "individual.dob.day",
    "individual.dob.month",
    "individual.dob.year",
    "company.address.city",
  ]);
  assert.deepEqual(
    requisitos.map((r) => r.label),
    ["Tu fecha de nacimiento", "La ciudad de tu dirección fiscal"]
  );
});

test("los prefijos company./individual./owners[n]. son el mismo papel", () => {
  assert.equal(translateRequirement("company.tax_id").label, translateRequirement("individual.tax_id").label);
  assert.equal(
    translateRequirement("owners[0].verification.document").label,
    "Una foto de tu DNI, NIE o pasaporte"
  );
});

test("un requisito desconocido se enseña con su código, no en crudo", () => {
  const requisito = translateRequirement("algo.que.stripe.invente.manana");
  assert.match(requisito.label, /Stripe todavía necesita/);
  assert.match(requisito.label, /algo\.que\.stripe\.invente\.manana/);
});

test("un motivo de bloqueo desconocido no deja la tarjeta muda", () => {
  assert.equal(translateDisabledReason(null), null);
  assert.match(translateDisabledReason("motivo_nuevo_de_stripe") ?? "", /todavía no permite cobrar/);
});

test("una cuenta operativa muestra payouts y la fecha del próximo", () => {
  const llegada = Math.floor(new Date("2026-09-10T00:00:00Z").getTime() / 1000);
  const status = buildConnectStatus(snapshot({ nextPayoutArrival: llegada, nextPayoutCents: 125_00 }));

  assert.equal(status.state, "ready");
  if (status.state !== "ready") return;
  assert.equal(status.payoutsEnabled, true);
  assert.equal(status.nextPayoutAt?.getTime(), llegada * 1000);
  assert.equal(status.nextPayoutCents, 125_00);
});

test("cobros activos pero payouts pendientes es un estado operativo con matiz", () => {
  const status = buildConnectStatus(snapshot({ payoutsEnabled: false }));
  assert.equal(status.state, "ready");
  assert.equal(status.state === "ready" && status.payoutsEnabled, false);
});

test("sin Connect en el entorno se dice QUÉ falta, para no dejar un botón muerto", async () => {
  // El CI deja las claves de Stripe sin definir a propósito (modo demo), así que
  // este es el estado real de este entorno.
  assert.deepEqual(missingConnectEnvVars({}), ["STRIPE_SECRET_KEY", "STRIPE_CONNECT_CLIENT_ID"]);
  assert.deepEqual(missingConnectEnvVars({ STRIPE_SECRET_KEY: "sk_test_x" }), ["STRIPE_CONNECT_CLIENT_ID"]);

  const org = await prisma.organization.create({ data: { name: "Connect status", slug: SLUG } });
  const status = await getConnectStatus(org.id);
  assert.equal(status.state, "not-configured");
  assert.ok(status.state === "not-configured" && status.missing.length > 0);
});

async function cleanup() {
  await prisma.organization.deleteMany({ where: { slug: { startsWith: SLUG } } });
}
before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});
