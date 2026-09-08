import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { reconcileMemberInvoicePaid } from "@/lib/member-billing";
import { recordBalanceBreakdown } from "@/lib/stripe-balance";
import { resolveInvoiceChargeId } from "@/lib/stripe-invoice";

/**
 * HU-ST-23 (S1) · El punto de enganche del desglose.
 *
 * S1 solo deja la llamada puesta; el cuerpo lo escribe P4. Lo que se prueba
 * aquí es la costura: que la conciliación del cobro llama al enganche con el
 * `Payment` correcto —por los DOS caminos por los que puede pasar— y que
 * ponerlo ahí no ha roto nada de lo que ya hacía `reconcileMemberInvoicePaid`.
 */

const SLUG = "e2e-enganche-desglose";

let orgId = "";
let memberId = "";
let subscriptionId = "";
const STRIPE_SUB_ID = `sub_${SLUG}`;

/** Captura lo que registra el módulo vacío: hoy es su único efecto observable. */
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

function factura(id: string, amountPaid: number): Stripe.Invoice {
  return {
    id,
    amount_paid: amountPaid,
    amount_due: amountPaid,
    // Shape vigente: la suscripción vive bajo `parent` (HU-ST-02).
    parent: { subscription_details: { subscription: STRIPE_SUB_ID } },
    lines: { data: [{ period: { end: Math.floor(Date.UTC(2026, 9, 8) / 1000) } }] },
  } as unknown as Stripe.Invoice;
}

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.notification.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Enganche desglose", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Desglose",
      email: `${SLUG}@example.com`,
    },
  });
  memberId = member.id;
  const plan = await prisma.membershipPlan.create({
    data: { orgId, name: "Cuota", type: "MONTHLY", priceCents: 4900 },
  });
  const subscription = await prisma.subscription.create({
    data: {
      memberId,
      planId: plan.id,
      centerId: center.id,
      startDate: new Date("2026-01-01"),
      priceCents: 4900,
      stripeSubscriptionId: STRIPE_SUB_ID,
    },
  });
  subscriptionId = subscription.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("un cobro NUEVO llama al enganche con el Payment recién creado", async () => {
  const captura = capturarLog();
  let resultado;
  try {
    resultado = await reconcileMemberInvoicePaid(orgId, factura(`in_${SLUG}_nuevo`, 4900));
  } finally {
    captura.restaurar();
  }

  assert.equal(resultado.ok, true, "la conciliación sigue funcionando con el enganche puesto");

  const pago = await prisma.payment.findUniqueOrThrow({
    where: { stripeInvoiceId: `in_${SLUG}_nuevo` },
  });
  assert.equal(pago.status, "PAID");

  const linea = captura.lineas.find((l) => l.includes("[stripe-balance]"));
  assert.notEqual(linea, undefined, "el enganche tiene que haberse llamado");
  assert.equal(linea!.includes(pago.id), true, `el enganche recibió otro paymentId: ${linea}`);
});

test("un cobro RECUPERADO tras un intento fallido llama al enganche con el Payment que ya existía", async () => {
  // La otra rama: el dunning de Stripe reintenta LA MISMA factura, así que el
  // `Payment` ya está en FAILED y se actualiza en vez de crearse. Si el
  // enganche solo cubriera la rama de creación, el desglose de todo cobro
  // recuperado se perdería —justo el que más interesa cuadrar—.
  const invoiceId = `in_${SLUG}_recuperado`;
  const fallido = await prisma.payment.create({
    data: {
      orgId,
      memberId,
      subscriptionId,
      amountCents: 4900,
      method: "STRIPE",
      status: "FAILED",
      date: new Date(),
      stripeInvoiceId: invoiceId,
    },
  });

  const captura = capturarLog();
  let resultado;
  try {
    resultado = await reconcileMemberInvoicePaid(orgId, factura(invoiceId, 4900));
  } finally {
    captura.restaurar();
  }

  assert.equal(resultado.ok, true);

  const cobrado = await prisma.payment.findUniqueOrThrow({ where: { stripeInvoiceId: invoiceId } });
  assert.equal(cobrado.id, fallido.id, "se actualiza la fila, no se crea una segunda");
  assert.equal(cobrado.status, "PAID");

  const linea = captura.lineas.find((l) => l.includes("[stripe-balance]"));
  assert.notEqual(linea, undefined, "el enganche también cubre la rama de recuperación");
  assert.equal(linea!.includes(fallido.id), true, `el enganche recibió otro paymentId: ${linea}`);
});

test("la reentrega de un cobro ya conciliado no vuelve a llamar al enganche", async () => {
  // `reconcileMemberInvoicePaid` sale antes si el Payment ya está PAID. Sin
  // eso, P4 tendría que defenderse de un desglose duplicado por su cuenta.
  const captura = capturarLog();
  try {
    await reconcileMemberInvoicePaid(orgId, factura(`in_${SLUG}_nuevo`, 4900));
  } finally {
    captura.restaurar();
  }

  assert.equal(
    captura.lineas.some((l) => l.includes("[stripe-balance]")),
    false,
    "un cobro ya PAID no genera un segundo apunte de desglose"
  );
});

test("el enganche no devuelve nada y no lanza: es contabilidad colgada del camino del cobro", async () => {
  // Contrato que P4 tiene que respetar al rellenarlo. Si esto empieza a lanzar,
  // un `invoice.paid` que ya estaba bien se convierte en un 500 y Stripe lo
  // reintenta: se rompe el cobro por no poder anotar la comisión.
  const captura = capturarLog();
  try {
    const devuelto = await recordBalanceBreakdown("pay_inexistente", null);
    assert.equal(devuelto, undefined);
    await recordBalanceBreakdown("pay_inexistente", "ch_suelto");
  } finally {
    captura.restaurar();
  }
});

test("HU-ST-23: la referencia del cargo se lee del shape legado y es null en el vigente", async () => {
  // En la API vigente `Invoice` ya no trae `charge`: el enganche recibe null y
  // P4 lo resuelve por el PaymentIntent. Se sigue leyendo el campo legado
  // porque una cuenta pinneada a una versión antigua lo entrega.
  assert.equal(resolveInvoiceChargeId(factura("in_x", 100)), null);

  const legada = { ...factura("in_y", 100), charge: "ch_legado" } as unknown as Stripe.Invoice;
  assert.equal(resolveInvoiceChargeId(legada), "ch_legado");

  const expandida = { ...factura("in_z", 100), charge: { id: "ch_expandido" } } as unknown as Stripe.Invoice;
  assert.equal(resolveInvoiceChargeId(expandida), "ch_expandido");
});
