import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  archiveCoupon,
  couponDiscountLabel,
  createCoupon,
  getCouponPerformance,
  listCoupons,
  normalizeCouponCode,
  readCheckoutDiscount,
  readInvoiceDiscount,
  recordCheckoutDiscount,
  recordInvoiceDiscount,
  validateCouponInput,
} from "@/lib/stripe-coupons";
import { couponKey, promotionCodeKey } from "@/lib/stripe-idempotency";

/**
 * HU-ST-27 · Cupones y códigos promocionales medibles.
 *
 * Los tres escenarios de la historia, con el escenario principal —la medición,
 * que es lo que la historia pide de verdad: "dirección ve cuántas ventas y
 * cuánto importe ha traído cada código"— probado contra la base real, porque
 * el riesgo (contar ventas de otro centro, perder una venta cuyo cupón vino del
 * Dashboard, contar dos veces una reentrega del webhook) solo se manifiesta en
 * lo que queda escrito.
 *
 * Este entorno no tiene `STRIPE_SECRET_KEY`, así que el alta contra la cuenta
 * conectada degrada con un motivo explícito: lo que se comprueba aquí es que
 * **valida antes de llamar a nadie**, que el archivado nunca borra, y que la
 * conciliación del descuento escribe lo que la medición luego lee.
 */

const SLUG = "e2e-stripe-coupons-test";

type Fixture = { orgId: string; centerA: string; centerB: string; memberA: string; memberB: string };

async function fixture(): Promise<Fixture> {
  const org = await prisma.organization.create({ data: { name: "Cupones", slug: SLUG } });
  const centerA = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SLUG}-a` } });
  const centerB = await prisma.center.create({ data: { orgId: org.id, name: "Santander", slug: `${SLUG}-b` } });
  const memberA = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: centerA.id, firstName: "Ana", lastName: "Jota", email: `${SLUG}-a@example.com` },
  });
  const memberB = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: centerB.id, firstName: "Bea", lastName: "Santander", email: `${SLUG}-b@example.com` },
  });
  return { orgId: org.id, centerA: centerA.id, centerB: centerB.id, memberA: memberA.id, memberB: memberB.id };
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.stripeCoupon.deleteMany({ where: { orgId: org.id } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// Escenario 1 · alta de cupón
// ---------------------------------------------------------------------------

test("el código se normaliza igual venga como venga", () => {
  assert.equal(normalizeCouponCode(" verano 25 "), "VERANO-25");
  assert.equal(normalizeCouponCode("Año-Nuevo"), "ANO-NUEVO", "sin tildes ni eñes: Stripe no las admite en el código");
  assert.equal(normalizeCouponCode("VERANO25"), "VERANO25");
});

test("un cupón no puede ser porcentual y de importe fijo a la vez", () => {
  const ambos = validateCouponInput({ code: "MIXTO", percentOff: 20, amountOffCents: 500 });
  assert.equal(ambos.ok, false);
  const ninguno = validateCouponInput({ code: "VACIO" });
  assert.equal(ninguno.ok, false);
  const solo = validateCouponInput({ code: "VERANO25", percentOff: 20 });
  assert.equal(solo.ok, true);
});

test("los descuentos imposibles se rechazan antes de llegar a Stripe", () => {
  assert.equal(validateCouponInput({ code: "CERO", percentOff: 0 }).ok, false);
  assert.equal(validateCouponInput({ code: "CIENTOUNO", percentOff: 101 }).ok, false);
  assert.equal(validateCouponInput({ code: "NEGATIVO", amountOffCents: -500 }).ok, false);
  assert.equal(validateCouponInput({ code: "AB", percentOff: 10 }).ok, false, "código demasiado corto");
  assert.equal(validateCouponInput({ code: "CON ESPACIO$", percentOff: 10 }).ok, false, "carácter no admitido");
});

test("una caducidad ya pasada no vale", () => {
  const ahora = new Date("2026-09-15T10:00:00Z");
  assert.equal(validateCouponInput({ code: "CADUCADO", percentOff: 10, redeemBy: new Date("2026-09-01") }, ahora).ok, false);
  assert.equal(validateCouponInput({ code: "VIGENTE", percentOff: 10, redeemBy: new Date("2026-12-31") }, ahora).ok, true);
});

test("la validación corre ANTES de tocar Stripe y no deja espejo a medias", async () => {
  const fx = await fixture();
  // Sin `STRIPE_SECRET_KEY` el alta no puede completarse; lo que importa es que
  // un cupón inválido ni siquiera llega a intentarlo, y que un fallo de la
  // pasarela no deja fila local: un código espejado que no existe en Stripe se
  // teclearía en el checkout y sería rechazado sin que la pantalla lo supiera.
  const invalido = await createCoupon(fx.orgId, { code: "X", percentOff: 20 });
  assert.equal(invalido.ok, false);

  const sinStripe = await createCoupon(fx.orgId, { code: "VERANO25", percentOff: 20 });
  assert.equal(sinStripe.ok, false);
  assert.equal(await prisma.stripeCoupon.count({ where: { orgId: fx.orgId } }), 0);
  await cleanup();
});

test("las dos creaciones contra Stripe llevan clave de idempotencia y no la comparten", () => {
  assert.equal(couponKey("org_1", "VERANO25"), "coupon:org_1:VERANO25:v1");
  assert.equal(promotionCodeKey("org_1", "VERANO25"), "promocode:org_1:VERANO25:v1");
  assert.notEqual(couponKey("org_1", "VERANO25"), promotionCodeKey("org_1", "VERANO25"));
  // Dar de alta "VERANO25" dos veces nunca es una venta nueva: la clave no
  // lleva ventana temporal, así que el reintento devuelve el mismo cupón.
  assert.equal(couponKey("org_1", "VERANO25"), couponKey("org_1", "VERANO25"));
  assert.notEqual(couponKey("org_1", "VERANO25"), couponKey("org_2", "VERANO25"));

  const fuente = readFileSync("src/lib/stripe-coupons.ts", "utf8");
  const patron = /stripe\.([a-zA-Z.]+)\(/g;
  let match: RegExpExecArray | null;
  while ((match = patron.exec(fuente)) !== null) {
    if (!match[1].endsWith("create")) continue;
    const ventana = fuente.slice(match.index, match.index + 900);
    assert.ok(ventana.includes("idempotencyKey"), `stripe.${match[1]} se crea sin clave de idempotencia`);
  }
});

// ---------------------------------------------------------------------------
// Invariante · un cupón retirado se ARCHIVA, nunca se borra
// ---------------------------------------------------------------------------

test("archivar deja la fila y los cobros que ya lo usaron", async () => {
  const fx = await fixture();
  const coupon = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_arch", stripePromotionCodeId: "promo_arch", code: "VERANO25", percentOff: 20 },
  });
  await prisma.payment.create({
    data: {
      orgId: fx.orgId,
      memberId: fx.memberA,
      amountCents: 4000,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      couponId: coupon.id,
      discountAmountCents: 1000,
    },
  });

  const archived = await archiveCoupon(fx.orgId, coupon.id);
  assert.equal(archived.ok, true);
  const row = await prisma.stripeCoupon.findUnique({ where: { id: coupon.id } });
  assert.ok(row, "archivar NO puede borrar la fila: dejaría huérfano el cobro que ya lo aplicó");
  assert.equal(row.active, false);

  // Y la venta sigue contando hacia atrás, que es todo el motivo de archivar.
  const [medido] = await getCouponPerformance(fx.orgId, { includeArchived: true });
  assert.equal(medido.sales, 1);
  assert.equal(medido.grossCents, 4000);

  // Ya archivado, volver a archivar es un no-op, no un error.
  assert.equal((await archiveCoupon(fx.orgId, coupon.id)).ok, true);
  // Y por defecto el listado solo enseña los vivos.
  assert.equal((await listCoupons(fx.orgId)).length, 0);
  assert.equal((await listCoupons(fx.orgId, { includeArchived: true })).length, 1);
  await cleanup();
});

test("no se borra un cupón en ningún sitio del código", () => {
  // RB-VENTA-002 extendido al cupón: `coupons.del` se llevaría por delante el
  // Coupon al que apuntan los Payment ya cobrados.
  const fuente = readFileSync("src/lib/stripe-coupons.ts", "utf8");
  assert.equal(/coupons\.del\(/.test(fuente), false, "un cupón retirado se archiva, nunca se borra");
  assert.equal(/stripeCoupon\.delete/.test(fuente), false, "tampoco se borra el espejo");
});

test("un cupón de otra organización no se puede archivar", async () => {
  const fx = await fixture();
  const otra = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  const ajeno = await prisma.stripeCoupon.create({
    data: { orgId: otra.id, stripeCouponId: "coupon_ajeno", code: "AJENO", percentOff: 10 },
  });

  const result = await archiveCoupon(fx.orgId, ajeno.id);
  assert.equal(result.ok, false);
  assert.equal((await prisma.stripeCoupon.findUnique({ where: { id: ajeno.id } }))?.active, true);
  await cleanup();
});

// ---------------------------------------------------------------------------
// Escenario 2 · uso: el Payment registra el descuento aplicado
// ---------------------------------------------------------------------------

function session(overrides: Record<string, unknown>): Stripe.Checkout.Session {
  return { id: "cs_test", object: "checkout.session", ...overrides } as unknown as Stripe.Checkout.Session;
}

test("del checkout se lee el importe descontado y de qué código vino", () => {
  const leido = readCheckoutDiscount(
    session({
      total_details: { amount_discount: 1000 },
      discounts: [{ coupon: { id: "coupon_1", name: "Verano" }, promotion_code: { id: "promo_1", code: "VERANO25" } }],
    })
  );
  assert.deepEqual(leido, {
    amountCents: 1000,
    stripeCouponId: "coupon_1",
    stripePromotionCodeId: "promo_1",
    code: "VERANO25",
    name: "Verano",
  });

  assert.equal(readCheckoutDiscount(session({ total_details: { amount_discount: 0 } })), null, "sin descuento, nada que registrar");
  assert.equal(readCheckoutDiscount(session({})), null);

  // Importe sin cupón identificable: se conserva la cifra igual. Perderla sería
  // perder la mitad de la medición.
  const soloImporte = readCheckoutDiscount(session({ total_details: { amount_discount: 500 } , discounts: [] }));
  assert.equal(soloImporte?.amountCents, 500);
  assert.equal(soloImporte?.stripeCouponId, null);
});

test("de la factura recurrente se lee el cupón de `discount.source` (versión de API fijada)", () => {
  const invoice = {
    total_discount_amounts: [
      {
        amount: 1200,
        discount: {
          id: "di_1",
          source: { type: "coupon", coupon: { id: "coupon_2", name: "Bienvenida" } },
          promotion_code: { id: "promo_2", code: "BIENVENIDA" },
        },
      },
    ],
  } as unknown as Stripe.Invoice;

  assert.deepEqual(readInvoiceDiscount(invoice), {
    amountCents: 1200,
    stripeCouponId: "coupon_2",
    stripePromotionCodeId: "promo_2",
    code: "BIENVENIDA",
    name: "Bienvenida",
  });

  // Sin expandir, el Discount llega como cadena: el importe se conserva, el
  // cupón no se puede resolver y no se inventa.
  const sinExpandir = { total_discount_amounts: [{ amount: 300, discount: "di_9" }] } as unknown as Stripe.Invoice;
  assert.equal(readInvoiceDiscount(sinExpandir)?.amountCents, 300);
  assert.equal(readInvoiceDiscount(sinExpandir)?.stripeCouponId, null);
});

test("el descuento del checkout queda escrito en el Payment y no se cuenta dos veces", async () => {
  const fx = await fixture();
  const coupon = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_uso", stripePromotionCodeId: "promo_uso", code: "VERANO25", percentOff: 20 },
  });
  const payment = await prisma.payment.create({
    data: {
      orgId: fx.orgId,
      memberId: fx.memberA,
      amountCents: 4000,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripeCheckoutSessionId: "cs_uso",
    },
  });

  const evento = session({
    id: "cs_uso",
    total_details: { amount_discount: 1000 },
    discounts: [{ coupon: "coupon_uso", promotion_code: "promo_uso" }],
  });

  await recordCheckoutDiscount(fx.orgId, evento);
  // Reentrega del webhook: escribe exactamente lo mismo, no acumula.
  await recordCheckoutDiscount(fx.orgId, evento);

  const actualizado = await prisma.payment.findUnique({ where: { id: payment.id } });
  assert.equal(actualizado?.discountAmountCents, 1000);
  assert.equal(actualizado?.couponId, coupon.id);
  assert.equal(await prisma.stripeCoupon.count({ where: { orgId: fx.orgId } }), 1, "no se duplica el espejo");
  await cleanup();
});

test("un cupón creado en el Dashboard de Stripe se espeja al usarse, para no perder la venta", async () => {
  const fx = await fixture();
  await prisma.payment.create({
    data: {
      orgId: fx.orgId,
      memberId: fx.memberA,
      amountCents: 4500,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripeCheckoutSessionId: "cs_dashboard",
    },
  });

  await recordCheckoutDiscount(
    fx.orgId,
    session({
      id: "cs_dashboard",
      total_details: { amount_discount: 500 },
      discounts: [{ coupon: { id: "coupon_dash", name: "Puerta fría" }, promotion_code: { id: "promo_dash", code: "PUERTAFRIA" } }],
    })
  );

  const espejo = await prisma.stripeCoupon.findFirst({ where: { orgId: fx.orgId, stripeCouponId: "coupon_dash" } });
  assert.ok(espejo, "sin fila local la venta se perdería para la medición");
  assert.equal(espejo.code, "PUERTAFRIA");
  const [medido] = await getCouponPerformance(fx.orgId);
  assert.equal(medido.sales, 1);
  assert.equal(medido.discountCents, 500);
  await cleanup();
});

test("el descuento de una cuota recurrente se registra sobre su propio Payment", async () => {
  const fx = await fixture();
  const payment = await prisma.payment.create({
    data: { orgId: fx.orgId, memberId: fx.memberA, amountCents: 3900, method: "STRIPE", status: "PAID", date: new Date() },
  });

  await recordInvoiceDiscount(
    fx.orgId,
    {
      total_discount_amounts: [
        { amount: 1000, discount: { id: "di_r", source: { type: "coupon", coupon: { id: "coupon_rec" } }, promotion_code: { id: "promo_rec", code: "RECURRENTE" } } },
      ],
    } as unknown as Stripe.Invoice,
    payment.id
  );

  const actualizado = await prisma.payment.findUnique({ where: { id: payment.id } });
  assert.equal(actualizado?.discountAmountCents, 1000);
  assert.ok(actualizado?.couponId);
  await cleanup();
});

test("no se escribe el descuento en el Payment de otra organización", async () => {
  const fx = await fixture();
  const otra = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  await prisma.payment.create({
    data: {
      orgId: fx.orgId,
      memberId: fx.memberA,
      amountCents: 4000,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripeCheckoutSessionId: "cs_cruzado",
    },
  });

  // El webhook ya viene acotado por cuenta conectada, pero la función acota
  // además por `orgId` (defensa en profundidad, igual que los reconciliadores).
  await recordCheckoutDiscount(
    otra.id,
    session({ id: "cs_cruzado", total_details: { amount_discount: 1000 }, discounts: [{ coupon: "coupon_x", promotion_code: null }] })
  );

  const intacto = await prisma.payment.findFirst({ where: { stripeCheckoutSessionId: "cs_cruzado" } });
  assert.equal(intacto?.discountAmountCents, null);
  await cleanup();
});

// ---------------------------------------------------------------------------
// Escenario 3 (principal) · medición: cuántas ventas y cuánto importe
// ---------------------------------------------------------------------------

test("dirección ve cuántas ventas y cuánto importe ha traído cada código", async () => {
  const fx = await fixture();
  const verano = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_verano", code: "VERANO25", percentOff: 20 },
  });
  const vacio = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_vacio", code: "NADIE", amountOffCents: 500, currency: "eur" },
  });

  await prisma.payment.createMany({
    data: [
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 4000, method: "STRIPE", status: "PAID", date: new Date(), couponId: verano.id, discountAmountCents: 1000 },
      { orgId: fx.orgId, memberId: fx.memberB, amountCents: 8000, method: "STRIPE", status: "PAID", date: new Date(), couponId: verano.id, discountAmountCents: 2000 },
      // Sin cobrar todavía: no ha traído nada, así que no cuenta.
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 4000, method: "STRIPE", status: "PENDING", date: new Date(), couponId: verano.id, discountAmountCents: 1000 },
      // Sin código: no entra en ninguna fila.
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 5000, method: "CASH", status: "PAID", date: new Date() },
    ],
  });

  const filas = await getCouponPerformance(fx.orgId);
  const porCodigo = new Map(filas.map((f) => [f.code, f]));

  assert.equal(porCodigo.get("VERANO25")?.sales, 2);
  assert.equal(porCodigo.get("VERANO25")?.grossCents, 12000, "lo que entró, ya descontado");
  assert.equal(porCodigo.get("VERANO25")?.discountCents, 3000, "lo que costó");

  // Un código sin ninguna venta sale a cero: es justo lo que hay que ver para
  // retirarlo, no una fila que desaparece del informe.
  assert.ok(porCodigo.has("NADIE"));
  assert.equal(porCodigo.get("NADIE")?.sales, 0);
  assert.equal(porCodigo.get("NADIE")?.grossCents, 0);
  assert.equal(vacio.id, porCodigo.get("NADIE")?.id);
  await cleanup();
});

test("la medición respeta el ámbito de centro", async () => {
  const fx = await fixture();
  const coupon = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_ambito", code: "AMBITO", percentOff: 10 },
  });
  await prisma.payment.createMany({
    data: [
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 4000, method: "STRIPE", status: "PAID", date: new Date(), couponId: coupon.id, discountAmountCents: 400 },
      { orgId: fx.orgId, memberId: fx.memberB, amountCents: 9000, method: "STRIPE", status: "PAID", date: new Date(), couponId: coupon.id, discountAmountCents: 900 },
    ],
  });

  // Dirección de organización (`centerScopeFor` devuelve null → `undefined`).
  const todo = await getCouponPerformance(fx.orgId);
  assert.equal(todo[0].sales, 2);
  assert.equal(todo[0].grossCents, 13000);

  // Dirección de un solo centro: solo sus ventas.
  const soloA = await getCouponPerformance(fx.orgId, { centerIds: [fx.centerA] });
  assert.equal(soloA[0].sales, 1);
  assert.equal(soloA[0].grossCents, 4000);

  // Ámbito vacío no es "todo": es nada. Mismo criterio que `billing-queries.ts`.
  const sinCentros = await getCouponPerformance(fx.orgId, { centerIds: [] });
  assert.equal(sinCentros[0].sales, 0);
  await cleanup();
});

test("la medición no cruza organizaciones", async () => {
  const fx = await fixture();
  const otra = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  const centro = await prisma.center.create({ data: { orgId: otra.id, name: "Ajeno", slug: `${SLUG}-otra-c` } });
  const socio = await prisma.member.create({
    data: { orgId: otra.id, primaryCenterId: centro.id, firstName: "Ajena", lastName: "Otra", email: `${SLUG}-otra@example.com` },
  });
  const mio = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_mio", code: "MIO", percentOff: 10 },
  });
  const suyo = await prisma.stripeCoupon.create({
    data: { orgId: otra.id, stripeCouponId: "coupon_suyo", code: "SUYO", percentOff: 10 },
  });
  await prisma.payment.createMany({
    data: [
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 1000, method: "STRIPE", status: "PAID", date: new Date(), couponId: mio.id, discountAmountCents: 100 },
      { orgId: otra.id, memberId: socio.id, amountCents: 9999, method: "STRIPE", status: "PAID", date: new Date(), couponId: suyo.id, discountAmountCents: 999 },
    ],
  });

  const filas = await getCouponPerformance(fx.orgId);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].code, "MIO");
  assert.equal(filas[0].grossCents, 1000);
  await cleanup();
});

test("la medición se puede acotar a un periodo", async () => {
  const fx = await fixture();
  const coupon = await prisma.stripeCoupon.create({
    data: { orgId: fx.orgId, stripeCouponId: "coupon_periodo", code: "PERIODO", percentOff: 10 },
  });
  await prisma.payment.createMany({
    data: [
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 1000, method: "STRIPE", status: "PAID", date: new Date("2026-06-15"), couponId: coupon.id, discountAmountCents: 100 },
      { orgId: fx.orgId, memberId: fx.memberA, amountCents: 2000, method: "STRIPE", status: "PAID", date: new Date("2026-09-10"), couponId: coupon.id, discountAmountCents: 200 },
    ],
  });

  const septiembre = await getCouponPerformance(fx.orgId, { from: new Date("2026-09-01"), to: new Date("2026-10-01") });
  assert.equal(septiembre[0].sales, 1);
  assert.equal(septiembre[0].grossCents, 2000);
  await cleanup();
});

test("la etiqueta del descuento distingue porcentaje, importe y espejo incompleto", () => {
  assert.match(couponDiscountLabel({ percentOff: 20, amountOffCents: null }), /20/);
  assert.match(couponDiscountLabel({ percentOff: null, amountOffCents: 1000 }), /10/);
  assert.equal(couponDiscountLabel({ percentOff: null, amountOffCents: null }), "—");
});
