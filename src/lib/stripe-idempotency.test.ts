import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { recordPendingCheckoutPayment } from "@/lib/member-billing";
import {
  CHECKOUT_WINDOW_MS,
  customerKey,
  idempotencyKey,
  memberCheckoutKey,
  platformCheckoutKey,
  platformCustomerKey,
  priceKey,
  productKey,
  prospectCheckoutKey,
} from "@/lib/stripe-idempotency";

/**
 * HU-ST-04 · `grep idempotencyKey src/` devolvía cero resultados: toda creación
 * contra Stripe podía duplicarse ante un reintento de red. Lo que se prueba
 * aquí es (1) que las claves siguen el patrón documentado y agrupan lo que
 * deben, (2) que el lado local no duplica el Payment PENDING y (3) —
 * estructural — que no queda ninguna creación sin clave en los ficheros que
 * hablan con Stripe.
 */

const SLUG = "e2e-idempotency-test";

test("la clave sigue el patrón <recurso>:<orgId>:<entidad>:<versión>", () => {
  assert.equal(idempotencyKey("price", "org_1", ["plan_1", "4900"]), "price:org_1:plan_1_4900:v1");
  assert.equal(productKey("org_1", "plan_1"), "product:org_1:plan_1:v1");
  assert.equal(customerKey("org_1", "mem_1"), "customer:org_1:mem_1:v1");
  assert.equal(platformCustomerKey("org_1"), "customer:platform:org_1:v1");

  for (const key of [
    productKey("org_1", "plan_1"),
    priceKey("org_1", "plan_1", 4900, true),
    customerKey("org_1", "mem_1"),
    memberCheckoutKey("org_1", "mem_1", "plan_1"),
    prospectCheckoutKey("org_1", "Ana@Example.com", "plan_1"),
    platformCustomerKey("org_1"),
    platformCheckoutKey("org_1", "AVANZADO_MES"),
  ]) {
    assert.match(key, /^[a-z]+:[^:]+:[^:]+:v\d+$/, `clave fuera de patrón: ${key}`);
  }
});

test("dos intentos del mismo checkout en la misma ventana comparten clave", () => {
  const at = new Date("2026-09-06T10:00:00Z");
  const cincoMinutosDespues = new Date(at.getTime() + 5 * 60_000);
  const mediaHoraDespues = new Date(at.getTime() + 3 * CHECKOUT_WINDOW_MS);

  assert.equal(
    memberCheckoutKey("org_1", "mem_1", "plan_1", at),
    memberCheckoutKey("org_1", "mem_1", "plan_1", cincoMinutosDespues),
    "un doble clic de recepción no puede abrir dos sesiones de cobro"
  );
  assert.notEqual(
    memberCheckoutKey("org_1", "mem_1", "plan_1", at),
    memberCheckoutKey("org_1", "mem_1", "plan_1", mediaHoraDespues),
    "media hora después es una venta nueva, no un reintento"
  );
});

test("el checkout de un socio no se confunde con el de otro ni con otro plan", () => {
  const at = new Date("2026-09-06T10:00:00Z");
  assert.notEqual(memberCheckoutKey("org_1", "mem_1", "plan_1", at), memberCheckoutKey("org_1", "mem_2", "plan_1", at));
  assert.notEqual(memberCheckoutKey("org_1", "mem_1", "plan_1", at), memberCheckoutKey("org_1", "mem_1", "plan_2", at));
  assert.notEqual(memberCheckoutKey("org_1", "mem_1", "plan_1", at), memberCheckoutKey("org_2", "mem_1", "plan_1", at));
});

test("el email del prospecto se normaliza antes de entrar en la clave", () => {
  const at = new Date("2026-09-06T10:00:00Z");
  assert.equal(
    prospectCheckoutKey("org_1", " Ana@Example.com ", "plan_1", at),
    prospectCheckoutKey("org_1", "ana@example.com", "plan_1", at)
  );
});

test("cambiar el importe de un plan produce una clave de precio distinta", () => {
  // RB-VENTA-007: subir la cuota tiene que crear un Price NUEVO. Si el importe
  // no entrara en la clave, Stripe devolvería el precio viejo desde su caché de
  // idempotencia y el gimnasio seguiría cobrando de menos.
  assert.notEqual(priceKey("org_1", "plan_1", 4900, true), priceKey("org_1", "plan_1", 5900, true));
  // Y un bono puntual no comparte precio con una cuota recurrente del mismo importe.
  assert.notEqual(priceKey("org_1", "plan_1", 4900, true), priceKey("org_1", "plan_1", 4900, false));
});

test("el mismo checkout no deja dos Payment PENDING", async () => {
  const org = await prisma.organization.create({ data: { name: "Idempotencia", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Idempotencia",
      email: `${SLUG}@example.com`,
    },
  });

  const args = {
    orgId: org.id,
    memberId: member.id,
    amountCents: 4900,
    checkoutSessionId: `cs_${SLUG}`,
    soldByUserId: null,
    planName: "Bono 10",
  };
  // Reintento de red: Stripe devuelve la MISMA sesión gracias a la clave, y el
  // lado local no puede duplicar el recibo pendiente ni reventar por unicidad.
  await recordPendingCheckoutPayment(args);
  await recordPendingCheckoutPayment(args);

  const payments = await prisma.payment.findMany({ where: { orgId: org.id } });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].status, "PENDING");
});

test("ninguna creación contra Stripe se queda sin clave de idempotencia", () => {
  // La excepción documentada es `createLicenseCheckoutSession` (alta anónima):
  // con clave, dos compradores del mismo plan compartirían sesión de checkout.
  const EXCEPCIONES = ["billingPortal.sessions.create", "oauth.token"];
  const ficheros = [
    "src/lib/member-billing.ts",
    "src/lib/platform-billing.ts",
    "src/lib/stripe-connect.ts",
  ];

  for (const fichero of ficheros) {
    const fuente = readFileSync(fichero, "utf8");
    const patron = /stripe\.([a-zA-Z.]+)\(/g;
    let match: RegExpExecArray | null;
    while ((match = patron.exec(fuente)) !== null) {
      const firma = match[1];
      if (!firma.endsWith("create")) continue;
      if (EXCEPCIONES.includes(firma)) continue;
      // Ventana alrededor de la llamada: el comentario que justifica la única
      // excepción va justo encima, y `idempotencyKey` va en las opciones,
      // después del cuerpo de la petición.
      const ventana = fuente.slice(Math.max(0, match.index - 600), match.index + 1600);
      const esExcepcionAnonima = ventana.includes("única creación deliberadamente SIN clave");
      assert.ok(
        ventana.includes("idempotencyKey") || esExcepcionAnonima,
        `${fichero}: stripe.${firma} se crea sin clave de idempotencia`
      );
    }
  }
});

before(async () => {
  await cleanup();
});
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}
