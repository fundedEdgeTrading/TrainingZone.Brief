import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import {
  listPayoutsWithComposition,
  payoutStatusFrom,
  reconcilePayout,
  reconcilePeriod,
  recordBalanceBreakdown,
} from "@/lib/stripe-balance";

/**
 * HU-ST-23 · Neto real, comisiones y payouts (P4).
 *
 * El escenario principal es el CUADRE: "la suma de netos de los cobros de un
 * payout coincide con su importe". Aquí se suma de verdad contra la base y se
 * compara; comprobar que la columna existe no probaría nada.
 *
 * Lo que NO se prueba aquí es la llamada a Stripe: en el entorno de test no hay
 * cuenta conectada, así que `stripeReadClient` degrada y eso es justo lo que se
 * comprueba en el camino del webhook (el payout queda guardado igualmente).
 */

const SLUG = "e2e-hu-st-23-payouts";

let orgId = "";
let centerAId = "";
let centerBId = "";
let memberAId = "";
let memberBId = "";

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.stripePayout.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Payouts P4", slug: SLUG } });
  orgId = org.id;

  const centerA = await prisma.center.create({ data: { orgId, name: "Centro A", slug: `${SLUG}-a` } });
  const centerB = await prisma.center.create({ data: { orgId, name: "Centro B", slug: `${SLUG}-b` } });
  centerAId = centerA.id;
  centerBId = centerB.id;

  const memberA = await prisma.member.create({
    data: { orgId, primaryCenterId: centerAId, firstName: "Amaia", lastName: "Roiz", email: `a-${SLUG}@example.com` },
  });
  const memberB = await prisma.member.create({
    data: { orgId, primaryCenterId: centerBId, firstName: "Rubén", lastName: "Setién", email: `b-${SLUG}@example.com` },
  });
  memberAId = memberA.id;
  memberBId = memberB.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

/** Un cobro de Stripe con su desglose ya anotado, como lo dejaría el enganche. */
async function cobro(opts: {
  memberId: string;
  ref: string;
  grossCents: number;
  feeCents: number;
  payoutId?: string;
  date?: Date;
}) {
  return prisma.payment.create({
    data: {
      orgId,
      memberId: opts.memberId,
      amountCents: opts.grossCents,
      method: "STRIPE",
      status: "PAID",
      date: opts.date ?? new Date("2026-09-03T10:00:00Z"),
      stripePaymentIntentId: `pi_${opts.ref}`,
      stripeBalanceTransactionId: `txn_${opts.ref}`,
      grossAmountCents: opts.grossCents,
      feeAmountCents: opts.feeCents,
      netAmountCents: opts.grossCents - opts.feeCents,
      payoutId: opts.payoutId,
    },
  });
}

test("HU-ST-23 · cuadre: la suma de netos de los cobros de un payout da su importe", async () => {
  // 49,00 € con 1,03 € de comisión y 60,00 € con 1,19 €: el payout liquida
  // 106,78 €. La cifra se calcula aquí a mano para que el test no repita la
  // misma fórmula que el código que prueba.
  const netoUno = 4900 - 103;
  const netoDos = 6000 - 119;
  const payout = await prisma.stripePayout.create({
    data: {
      orgId,
      stripePayoutId: `po_${SLUG}_1`,
      amountCents: netoUno + netoDos,
      status: "PAID",
      arrivalDate: new Date("2026-09-05T00:00:00Z"),
    },
  });

  await cobro({ memberId: memberAId, ref: `${SLUG}_1`, grossCents: 4900, feeCents: 103, payoutId: payout.id });
  await cobro({ memberId: memberBId, ref: `${SLUG}_2`, grossCents: 6000, feeCents: 119, payoutId: payout.id });

  const [vista] = await listPayoutsWithComposition(orgId);
  assert.equal(vista.stripePayoutId, `po_${SLUG}_1`);
  assert.equal(vista.arrivalDate?.toISOString().slice(0, 10), "2026-09-05", "la vista lleva arrival_date");
  assert.equal(vista.payments.length, 2, "y qué cobros lo componen");

  // La suma de verdad, sumada aquí desde la composición devuelta.
  const suma = vista.payments.reduce((total, p) => total + (p.netAmountCents ?? 0), 0);
  assert.equal(suma, 10678);
  assert.equal(suma, vista.amountCents, "suma de netos == importe del payout");
  assert.equal(vista.balanced, true);
});

test("HU-ST-23 · un payout al que le falta un cobro NO cuadra, y se ve", async () => {
  // El fallo que este cuadre tiene que cazar: Stripe liquida 30,00 € y solo
  // hay 20,00 € de netos anotados. Sin comparar importes, la pantalla enseñaría
  // el payout como si estuviera completo.
  const payout = await prisma.stripePayout.create({
    data: {
      orgId,
      stripePayoutId: `po_${SLUG}_descuadrado`,
      amountCents: 3000,
      status: "PAID",
      arrivalDate: new Date("2026-09-12T00:00:00Z"),
    },
  });
  await cobro({
    memberId: memberAId,
    ref: `${SLUG}_3`,
    grossCents: 2060,
    feeCents: 60,
    payoutId: payout.id,
    date: new Date("2026-09-10T10:00:00Z"),
  });

  const vistas = await listPayoutsWithComposition(orgId);
  const descuadrado = vistas.find((v) => v.stripePayoutId === `po_${SLUG}_descuadrado`);
  assert.ok(descuadrado);
  assert.equal(descuadrado.netSumCents, 2000);
  assert.equal(descuadrado.balanced, false, "faltan 10,00 € por anotar: no puede darse por bueno");

  const cuadre = await reconcilePeriod(orgId);
  assert.equal(cuadre.balanced, false);
  assert.equal(
    cuadre.payouts.find((p) => p.stripePayoutId === `po_${SLUG}_descuadrado`)?.balanced,
    false
  );
});

test("HU-ST-23 · ámbito de centro: la composición solo trae los cobros de tus centros", async () => {
  // Un director del centro A no puede ver —ni exportar— el cobro del socio del
  // centro B que va en el mismo payout.
  const vistas = await listPayoutsWithComposition(orgId, { centerIds: [centerAId] });
  const payout = vistas.find((v) => v.stripePayoutId === `po_${SLUG}_1`);
  assert.ok(payout);
  assert.equal(payout.payments.length, 1);
  assert.equal(payout.payments[0].centerId, centerAId);
  assert.equal(
    payout.balanced,
    null,
    "con ámbito de centro se ve una parte: decir que cuadra o que no cuadra sería mentir"
  );

  const cuadre = await reconcilePeriod(orgId, { centerIds: [centerAId] });
  assert.equal(cuadre.orgWide, false);
  assert.equal(cuadre.balanced, false);
});

test("HU-ST-23 · el cuadre del periodo suma solo los payouts liquidados de ese periodo", async () => {
  const cuadre = await reconcilePeriod(orgId, {
    from: new Date("2026-09-01T00:00:00Z"),
    to: new Date("2026-09-08T23:59:59Z"),
  });
  assert.equal(cuadre.payouts.length, 1, "el payout del día 12 queda fuera de la ventana");
  assert.equal(cuadre.payoutsTotalCents, 10678);
  assert.equal(cuadre.netTotalCents, 10678);
  assert.equal(cuadre.balanced, true);
});

test("HU-ST-23 · lo no liquidado todavía se cuenta aparte, no contra el payout", async () => {
  await cobro({
    memberId: memberAId,
    ref: `${SLUG}_pendiente`,
    grossCents: 2500,
    feeCents: 55,
    date: new Date("2026-09-30T10:00:00Z"),
  });

  const cuadre = await reconcilePeriod(orgId);
  assert.equal(cuadre.unsettledNetCents, 2445, "cobrado pero aún sin payout: ni descuadra ni desaparece");
});

test("HU-ST-23 · reconcilePayout guarda el payout aunque no haya lectura de Stripe", async () => {
  // Sin cuenta conectada `stripeReadClient` degrada. El payout —el importe y
  // la fecha en la que dirección espera el dinero— tiene que quedar guardado
  // igualmente: la composición se reconstruye después, el aviso no.
  const payout = {
    id: `po_${SLUG}_webhook`,
    amount: 8800,
    currency: "eur",
    status: "paid",
    arrival_date: Math.floor(Date.UTC(2026, 8, 20) / 1000),
    failure_message: null,
  } as unknown as Stripe.Payout;

  // El despachador de S1 espera que cada módulo del lote deje su rastro
  // (`stripe-webhook-dispatch.test.ts` lo comprueba desde el otro lado): una
  // línea por payout atendido, diga lo que diga la composición.
  const real = console.info;
  const lineas: string[] = [];
  console.info = (...args: unknown[]) => {
    lineas.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };

  let primera;
  try {
    primera = await reconcilePayout(orgId, payout, "payout.paid");
  } finally {
    console.info = real;
  }
  assert.equal(primera.ok, true);
  assert.equal(
    lineas.some((l) => l.includes("[stripe-balance]") && l.includes(payout.id)),
    true,
    `el payout tenía que dejar rastro, y registró: ${lineas.join(" | ")}`
  );

  const guardado = await prisma.stripePayout.findUniqueOrThrow({
    where: { orgId_stripePayoutId: { orgId, stripePayoutId: payout.id } },
  });
  assert.equal(guardado.amountCents, 8800);
  assert.equal(guardado.status, "PAID");
  assert.equal(guardado.arrivalDate?.toISOString().slice(0, 10), "2026-09-20");

  // Reentrega del mismo evento: upsert, no una segunda fila.
  const segunda = await reconcilePayout(orgId, payout, "payout.paid");
  assert.equal(segunda.ok, true);
  assert.equal(await prisma.stripePayout.count({ where: { orgId, stripePayoutId: payout.id } }), 1);
});

test("HU-ST-23 · payout.failed guarda el motivo, y el pago posterior lo limpia", async () => {
  const fallido = {
    id: `po_${SLUG}_fallido`,
    amount: 4500,
    currency: "eur",
    status: "failed",
    arrival_date: Math.floor(Date.UTC(2026, 8, 22) / 1000),
    failure_message: "La cuenta bancaria está cerrada.",
  } as unknown as Stripe.Payout;

  await reconcilePayout(orgId, fallido, "payout.failed");
  const tras = await prisma.stripePayout.findUniqueOrThrow({
    where: { orgId_stripePayoutId: { orgId, stripePayoutId: fallido.id } },
  });
  assert.equal(tras.status, "FAILED");
  assert.equal(tras.failureMessage, "La cuenta bancaria está cerrada.");

  // Stripe reintenta y esta vez entra: el motivo del fallo anterior no puede
  // quedarse colgado diciendo que la cuenta sigue cerrada.
  await reconcilePayout(orgId, { ...fallido, status: "paid", failure_message: null } as unknown as Stripe.Payout, "payout.paid");
  const reintentado = await prisma.stripePayout.findUniqueOrThrow({
    where: { orgId_stripePayoutId: { orgId, stripePayoutId: fallido.id } },
  });
  assert.equal(reintentado.status, "PAID");
  assert.equal(reintentado.failureMessage, null);
});

test("HU-ST-23 · el estado del payout se traduce, y un estado desconocido cree al evento", () => {
  assert.equal(payoutStatusFrom("paid"), "PAID");
  assert.equal(payoutStatusFrom("in_transit"), "IN_TRANSIT");
  assert.equal(payoutStatusFrom("failed"), "FAILED");
  assert.equal(payoutStatusFrom("canceled"), "CANCELED");
  assert.equal(payoutStatusFrom("pending"), "PENDING");
  assert.equal(payoutStatusFrom(undefined, "payout.failed"), "FAILED");
  assert.equal(payoutStatusFrom("algo_nuevo", "payout.paid"), "PENDING");
});

test("HU-ST-23 · el enganche no lanza nunca: ni sin cobro, ni sin Stripe, ni repetido", async () => {
  // Contrato heredado de S1 y probado en stripe-balance-hook.test.ts desde el
  // lado de la conciliación. Aquí se prueba desde dentro, ya con cuerpo: los
  // tres caminos que podrían tumbar un `invoice.paid` que ya estaba bien.
  assert.equal(await recordBalanceBreakdown("pay_inexistente", null), undefined);
  assert.equal(await recordBalanceBreakdown("pay_inexistente", "ch_suelto"), undefined);

  const ya = await cobro({ memberId: memberAId, ref: `${SLUG}_idem`, grossCents: 1000, feeCents: 30 });
  assert.equal(await recordBalanceBreakdown(ya.id, "ch_lo_que_sea"), undefined);

  const sinTocar = await prisma.payment.findUniqueOrThrow({ where: { id: ya.id } });
  assert.equal(sinTocar.stripeBalanceTransactionId, `txn_${SLUG}_idem`, "un desglose ya anotado no se reescribe");
  assert.equal(sinTocar.netAmountCents, 970);
});
