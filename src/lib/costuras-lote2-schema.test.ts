import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";

/**
 * Costuras del lote 2 (S1) · La migración única del lote.
 *
 * Lo que se prueba aquí NO son las historias —cada pista prueba la suya— sino
 * que el esquema sostiene lo que sus escenarios Gherkin dan por hecho, y que
 * las invariantes del trimestre siguen en pie después de tocarlo. Es la red que
 * avisa si alguien, dentro de tres semanas, "simplifica" una columna que otra
 * pista necesita.
 */

const SLUG = "e2e-costuras-lote2";

let orgId = "";
let centerId = "";
let memberId = "";
let planId = "";

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  // De las hojas a la raíz: todo cuelga de la organización.
  await prisma.accountDeletionRequest.deleteMany({ where: { orgId: org.id } });
  await prisma.paymentDispute.deleteMany({ where: { orgId: org.id } });
  await prisma.payment.deleteMany({ where: { orgId: org.id } });
  await prisma.stripePayout.deleteMany({ where: { orgId: org.id } });
  await prisma.stripeCoupon.deleteMany({ where: { orgId: org.id } });
  await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
  await prisma.sepaMandate.deleteMany({ where: { orgId: org.id } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.accessAttempt.deleteMany({ where: { key: { startsWith: SLUG } } });
}

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Costuras lote 2", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({
    data: { orgId, name: "Centro", slug: `${SLUG}-centro` },
  });
  centerId = center.id;
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: centerId,
      firstName: "Socio",
      lastName: "Costuras",
      email: `${SLUG}@example.com`,
    },
  });
  memberId = member.id;
  const plan = await prisma.membershipPlan.create({
    data: { orgId, name: "Cuota mensual", type: "MONTHLY", priceCents: 4900 },
  });
  planId = plan.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// HU-ST-12 · Mandato SEPA
// ---------------------------------------------------------------------------

test("HU-ST-12: el mandato guarda referencia y últimos 4 del IBAN, y la suscripción cuelga de él", async () => {
  const mandato = await prisma.sepaMandate.create({
    data: {
      orgId,
      memberId,
      stripeMandateId: "mandate_test_1",
      reference: "UMR-000123",
      ibanLast4: "4321",
      acceptedAt: new Date("2026-09-01T10:00:00Z"),
      status: "ACTIVE",
    },
  });

  assert.equal(mandato.ibanLast4.length, 4, "del IBAN solo se guardan los 4 últimos, nunca el completo");

  const suscripcion = await prisma.subscription.create({
    data: {
      memberId,
      planId,
      centerId,
      startDate: new Date(),
      priceCents: 4900,
      sepaMandateId: mandato.id,
      status: "PENDING_CONFIRMATION",
    },
    include: { sepaMandate: true },
  });

  assert.equal(suscripcion.sepaMandate?.reference, "UMR-000123");
});

test("HU-ST-12/RB-PAGO-025: una suscripción con el cobro asíncrono en vuelo NO está ACTIVE", async () => {
  // El motor de reservas filtra por `status === "ACTIVE"`. Que
  // PENDING_CONFIRMATION sea un estado DISTINTO es exactamente lo que impide
  // que un débito SEPA todavía sin liquidar abra acceso a reservas.
  const enVuelo = await prisma.subscription.findFirst({
    where: { memberId, status: "PENDING_CONFIRMATION" },
  });
  assert.notEqual(enVuelo, null, "el estado existe y se puede guardar");

  const comoActiva = await prisma.subscription.findFirst({
    where: { memberId, status: "ACTIVE" },
  });
  assert.equal(comoActiva, null, "no se cuela como activa: no da acceso hasta liquidar");
});

test("HU-ST-12: un mandato no se borra al revocarlo — se marca INACTIVE y conserva su rastro", async () => {
  const mandato = await prisma.sepaMandate.create({
    data: {
      orgId,
      memberId,
      stripeMandateId: "mandate_test_revocado",
      reference: "UMR-000999",
      ibanLast4: "0000",
    },
  });
  assert.equal(mandato.status, "PENDING", "nace pendiente de confirmación del banco");

  const revocado = await prisma.sepaMandate.update({
    where: { id: mandato.id },
    data: { status: "INACTIVE", revokedAt: new Date() },
  });
  assert.equal(revocado.reference, "UMR-000999", "la referencia sigue ahí para poder enseñarla");
});

test("HU-ST-12: el mismo id de mandato puede existir en dos cuentas conectadas distintas", async () => {
  // Los ids de Stripe son únicos DENTRO de una cuenta conectada. Una unicidad
  // global habría hecho que el segundo gimnasio no pudiera guardar su mandato.
  const otra = await prisma.organization.create({
    data: { name: "Otro gimnasio", slug: `${SLUG}-otra` },
  });
  const otroCentro = await prisma.center.create({
    data: { orgId: otra.id, name: "C", slug: `${SLUG}-otro-centro` },
  });
  const otroSocio = await prisma.member.create({
    data: {
      orgId: otra.id,
      primaryCenterId: otroCentro.id,
      firstName: "Otro",
      lastName: "Socio",
      email: `${SLUG}-otro@example.com`,
    },
  });

  await prisma.sepaMandate.create({
    data: {
      orgId: otra.id,
      memberId: otroSocio.id,
      stripeMandateId: "mandate_test_1", // mismo id que el de la otra org
      reference: "UMR-000123",
      ibanLast4: "4321",
    },
  });

  const cuantos = await prisma.sepaMandate.count({ where: { stripeMandateId: "mandate_test_1" } });
  assert.equal(cuantos, 2);

  await prisma.sepaMandate.deleteMany({ where: { orgId: otra.id } });
  await prisma.member.deleteMany({ where: { orgId: otra.id } });
  await prisma.center.deleteMany({ where: { orgId: otra.id } });
  await prisma.organization.delete({ where: { id: otra.id } });
});

// ---------------------------------------------------------------------------
// HU-ST-18 · Periodo de gracia (decisión D-S5)
// ---------------------------------------------------------------------------

test("HU-ST-18/D-S5: el periodo de gracia por defecto son 7 días", async () => {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(org.dunningGraceDays, 7);
});

test("HU-ST-18: la organización puede fijar el suyo dentro de 0-60", async () => {
  for (const dias of [0, 14, 60]) {
    const actualizada = await prisma.organization.update({
      where: { id: orgId },
      data: { dunningGraceDays: dias },
    });
    assert.equal(actualizada.dunningGraceDays, dias);
  }
  await prisma.organization.update({ where: { id: orgId }, data: { dunningGraceDays: 7 } });
});

test("HU-ST-18: la base de datos RECHAZA un periodo de gracia fuera de 0-60", async () => {
  // El CHECK vive en la base, no solo en el formulario: un valor negativo
  // dejaría al socio sin gracia ninguna, y uno absurdo convertiría la morosidad
  // en papel mojado.
  for (const invalido of [-1, 61, 3650]) {
    await assert.rejects(
      () => prisma.organization.update({ where: { id: orgId }, data: { dunningGraceDays: invalido } }),
      `un periodo de gracia de ${invalido} días tenía que rebotar`
    );
  }

  const intacta = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  assert.equal(intacta.dunningGraceDays, 7, "ningún intento inválido llegó a escribirse");
});

test("HU-ST-18: el socio guarda desde cuándo está impagando, y se limpia al recuperar", async () => {
  const inicio = new Date("2026-09-01T08:00:00Z");
  const moroso = await prisma.member.update({
    where: { id: memberId },
    data: { state: "DELINQUENT", delinquentSince: inicio },
  });
  assert.deepEqual(moroso.delinquentSince, inicio, "es la base desde la que cuenta el periodo de gracia");

  const recuperado = await prisma.member.update({
    where: { id: memberId },
    data: { state: "ACTIVE", delinquentSince: null },
  });
  assert.equal(recuperado.delinquentSince, null, "cobro recuperado: no hay impago abierto");
});

// ---------------------------------------------------------------------------
// HU-ST-20 · Reembolsos y notas de crédito
// ---------------------------------------------------------------------------

test("HU-ST-20: una devolución PARCIAL deja el importe original y registra lo devuelto, con autor y motivo", async () => {
  const pago = await prisma.payment.create({
    data: {
      orgId,
      memberId,
      amountCents: 6000,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripePaymentIntentId: `pi_${SLUG}_parcial`,
    },
  });

  const devuelto = await prisma.payment.update({
    where: { id: pago.id },
    data: {
      status: "REFUNDED",
      refundedAmountCents: 1000,
      refundReason: "Sesiones no disfrutadas",
      refundedAt: new Date(),
      stripeRefundId: `re_${SLUG}_parcial`,
      stripeCreditNoteId: `cn_${SLUG}_parcial`,
    },
  });

  assert.equal(devuelto.amountCents, 6000, "lo que pagó el socio no se toca");
  assert.equal(devuelto.refundedAmountCents, 1000, "y aparte, lo que se le devolvió");
  assert.equal(devuelto.refundReason, "Sesiones no disfrutadas", "el motivo es obligatorio en la historia");
  assert.equal(devuelto.stripeCreditNoteId, `cn_${SLUG}_parcial`, "la nota de crédito queda enlazada al Payment");
});

// ---------------------------------------------------------------------------
// HU-ST-21 · Disputas
// ---------------------------------------------------------------------------

test("HU-ST-21: la disputa guarda importe, due_by y resultado, y sobrevive al cierre", async () => {
  const pago = await prisma.payment.create({
    data: {
      orgId,
      memberId,
      amountCents: 4900,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripePaymentIntentId: `pi_${SLUG}_disputa`,
    },
  });

  const dueBy = new Date("2026-10-01T23:59:59Z");
  const disputa = await prisma.paymentDispute.create({
    data: {
      orgId,
      paymentId: pago.id,
      stripeDisputeId: `dp_${SLUG}`,
      amountCents: 4900,
      reason: "fraudulent",
      evidenceDueBy: dueBy,
    },
  });

  assert.equal(disputa.status, "NEEDS_RESPONSE", "nace esperando evidencia: es lo que hace urgente la tarea");
  assert.deepEqual(disputa.evidenceDueBy, dueBy, "pasado el plazo sin responder, la disputa se pierde sola");

  const cerrada = await prisma.paymentDispute.update({
    where: { id: disputa.id },
    data: { status: "LOST", closedAt: new Date() },
  });
  assert.equal(cerrada.status, "LOST", "charge.dispute.closed deja el resultado");
  assert.equal(cerrada.amountCents, 4900, "el importe reclamado sigue registrado tras cerrarse");
});

// ---------------------------------------------------------------------------
// HU-ST-23 · Desglose del cobro y payouts
// ---------------------------------------------------------------------------

test("HU-ST-23: la suma de netos de los cobros de un payout cuadra con su importe", async () => {
  const llegada = new Date("2026-09-15T00:00:00Z");
  const payout = await prisma.stripePayout.create({
    data: {
      orgId,
      stripePayoutId: `po_${SLUG}`,
      amountCents: 9500,
      status: "PAID",
      arrivalDate: llegada,
    },
  });

  // Dos cobros de 50 €, con su comisión, liquidados en el mismo payout.
  for (const n of [1, 2]) {
    await prisma.payment.create({
      data: {
        orgId,
        memberId,
        amountCents: 5000,
        method: "STRIPE",
        status: "PAID",
        date: new Date(),
        stripePaymentIntentId: `pi_${SLUG}_payout_${n}`,
        stripeBalanceTransactionId: `txn_${SLUG}_${n}`,
        grossAmountCents: 5000,
        feeAmountCents: 250,
        netAmountCents: 4750,
        payoutId: payout.id,
      },
    });
  }

  const cobros = await prisma.payment.findMany({ where: { payoutId: payout.id } });
  const sumaNetos = cobros.reduce((total, cobro) => total + (cobro.netAmountCents ?? 0), 0);

  assert.equal(cobros.length, 2, "el payout sabe qué cobros lo componen");
  assert.equal(sumaNetos, payout.amountCents, "escenario «cuadre» de HU-ST-23");
  assert.deepEqual(payout.arrivalDate, llegada, "«¿cuándo entra el dinero?» tiene respuesta");
});

test("HU-ST-23: el mismo balance transaction no se puede conciliar dos veces", async () => {
  // Idempotencia del desglose: `payout.paid` se reentrega, y sin esta unicidad
  // el mismo cobro se sumaba dos veces al cuadre.
  await assert.rejects(
    () =>
      prisma.payment.create({
        data: {
          orgId,
          memberId,
          amountCents: 5000,
          method: "STRIPE",
          status: "PAID",
          date: new Date(),
          stripeBalanceTransactionId: `txn_${SLUG}_1`, // ya usado arriba
        },
      }),
    "un segundo Payment con el mismo balance transaction tenía que rebotar"
  );
});

// ---------------------------------------------------------------------------
// HU-ST-27 · Cupones
// ---------------------------------------------------------------------------

test("HU-ST-27: el cupón se espeja y cada cobro registra el descuento aplicado", async () => {
  const cupon = await prisma.stripeCoupon.create({
    data: {
      orgId,
      stripeCouponId: `coupon_${SLUG}`,
      stripePromotionCodeId: `promo_${SLUG}`,
      code: "VERANO25",
      name: "Verano 2026",
      percentOff: 25,
    },
  });

  await prisma.payment.create({
    data: {
      orgId,
      memberId,
      amountCents: 3675,
      method: "STRIPE",
      status: "PAID",
      date: new Date(),
      stripePaymentIntentId: `pi_${SLUG}_cupon`,
      couponId: cupon.id,
      discountAmountCents: 1225,
    },
  });

  // La medición de la historia: cuántas ventas y cuánto importe ha traído.
  const ventas = await prisma.payment.findMany({ where: { couponId: cupon.id } });
  const descuento = ventas.reduce((total, venta) => total + (venta.discountAmountCents ?? 0), 0);

  assert.equal(ventas.length, 1);
  assert.equal(descuento, 1225);
});

test("HU-ST-27: un cupón no se borra nunca — se archiva, igual que un Price", async () => {
  const cupon = await prisma.stripeCoupon.findFirstOrThrow({ where: { orgId, code: "VERANO25" } });
  assert.equal(cupon.active, true);

  const archivado = await prisma.stripeCoupon.update({
    where: { id: cupon.id },
    data: { active: false },
  });
  assert.equal(archivado.active, false);

  // Y los cobros que lo aplicaron siguen apuntando a él: la medición hacia
  // atrás no se falsea.
  const ventas = await prisma.payment.count({ where: { couponId: cupon.id } });
  assert.equal(ventas, 1);

  await prisma.stripeCoupon.update({ where: { id: cupon.id }, data: { active: true } });
});

// ---------------------------------------------------------------------------
// E1-10 · Intentos de acceso
// ---------------------------------------------------------------------------

test("E1-10: los intentos se cuentan por email y por IP de forma independiente", async () => {
  const porEmail = await prisma.accessAttempt.create({
    data: { purpose: "LOGIN", scope: "EMAIL", key: `${SLUG}-recepcion@org`, failedCount: 5 },
  });
  const porIp = await prisma.accessAttempt.create({
    data: { purpose: "LOGIN", scope: "IP", key: `${SLUG}-198.51.100.7`, failedCount: 40 },
  });

  assert.equal(porEmail.failedCount, 5);
  assert.equal(porIp.failedCount, 40, "el barrido de muchos emails desde una IP tiene su propio límite");
  assert.equal(porEmail.blockedUntil, null, "todavía contando, sin bloquear");
});

test("E1-10: el contador es de ESTADO — se actualiza, cosa que AuditLog tiene prohibida", async () => {
  const clave = { purpose: "LOGIN" as const, scope: "EMAIL" as const, key: `${SLUG}-recepcion@org` };

  const bloqueado = await prisma.accessAttempt.update({
    where: { purpose_scope_key: clave },
    data: { failedCount: { increment: 1 }, blockedUntil: new Date("2026-09-08T12:00:00Z") },
  });
  assert.equal(bloqueado.failedCount, 6);
  assert.notEqual(bloqueado.blockedUntil, null);

  // Pasada la ventana, el usuario legítimo entra sin fricción: el recuento
  // arranca de cero en vez de arrastrar el bloqueo.
  const reiniciado = await prisma.accessAttempt.update({
    where: { purpose_scope_key: clave },
    data: { failedCount: 0, blockedUntil: null, windowStartedAt: new Date() },
  });
  assert.equal(reiniciado.failedCount, 0);
  assert.equal(reiniciado.blockedUntil, null);
});

test("E1-10: login y recuperación de contraseña cuentan por separado", async () => {
  const email = `${SLUG}-recepcion@org`;
  await prisma.accessAttempt.create({
    data: { purpose: "PASSWORD_RESET", scope: "EMAIL", key: email, failedCount: 2 },
  });

  const contadores = await prisma.accessAttempt.findMany({ where: { key: email } });
  assert.equal(contadores.length, 2, "el mismo email, dos contadores: uno por propósito");
});

test("E1-10: el contador NO lleva orgId — el barrido de emails cruza organizaciones", async () => {
  // Un contador por organización sería un contador que se esquiva cambiando de
  // tenant, y en el login todavía no se sabe a qué organización pertenece nadie.
  const columnas = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'AccessAttempt'
  `;
  const nombres = columnas.map((columna) => columna.column_name);
  assert.equal(nombres.includes("orgId"), false);
  assert.equal(nombres.includes("key"), true);
  assert.equal(nombres.includes("windowStartedAt"), true);
});

// ---------------------------------------------------------------------------
// E5-15 · Solicitud de borrado de cuenta
// ---------------------------------------------------------------------------

test("E5-15: la solicitud guarda su plazo de un mes y su resolución", async () => {
  const pedida = new Date("2026-09-08T09:00:00Z");
  const limite = new Date("2026-10-08T09:00:00Z"); // art. 12.3 RGPD

  const solicitud = await prisma.accountDeletionRequest.create({
    data: { orgId, memberId, source: "MOBILE_APP", requestedAt: pedida, dueAt: limite },
  });

  assert.equal(solicitud.status, "PENDING");
  assert.deepEqual(solicitud.dueAt, limite, "sin fecha límite nadie puede demostrar que se cumplió el plazo");

  const resuelta = await prisma.accountDeletionRequest.update({
    where: { id: solicitud.id },
    data: {
      status: "COMPLETED",
      resolvedAt: new Date("2026-09-20T10:00:00Z"),
      resolutionNotes: "Datos borrados; los cobros se disocian por conservación obligatoria.",
    },
  });
  assert.equal(resuelta.status, "COMPLETED");
  assert.match(resuelta.resolutionNotes ?? "", /disocian/);
});

test("E5-15: un socio no puede tener dos solicitudes abiertas a la vez", async () => {
  await assert.rejects(
    () =>
      prisma.accountDeletionRequest.create({
        data: {
          orgId,
          memberId,
          source: "WEB_PORTAL",
          dueAt: new Date("2026-11-01T00:00:00Z"),
        },
      }).then(() =>
        prisma.accountDeletionRequest.create({
          data: {
            orgId,
            memberId,
            source: "MOBILE_APP",
            dueAt: new Date("2026-11-02T00:00:00Z"),
          },
        })
      ),
    "dos plazos del art. 12.3 corriendo en paralelo sobre lo mismo"
  );

  // Las ya resueltas sí se acumulan: son el histórico.
  const resueltas = await prisma.accountDeletionRequest.count({
    where: { memberId, status: "COMPLETED" },
  });
  assert.equal(resueltas, 1);
});

// ---------------------------------------------------------------------------
// Invariantes del trimestre: la migración no las ha aflojado
// ---------------------------------------------------------------------------

test("invariante: AuditLog sigue siendo de solo inserción", async () => {
  const entrada = await prisma.auditLog.create({
    data: {
      orgId,
      action: "COSTURAS_LOTE2_TEST",
      entityType: "Organization",
      entityId: orgId,
    },
  });

  await assert.rejects(
    () => prisma.auditLog.update({ where: { id: entrada.id }, data: { action: "REESCRITO" } }),
    "el trigger auditlog_append_only sigue en su sitio"
  );

  const sinTocar = await prisma.auditLog.findUniqueOrThrow({ where: { id: entrada.id } });
  assert.equal(sinTocar.action, "COSTURAS_LOTE2_TEST");
});

test("invariante: ninguna tabla nueva permite mover sessionsRemaining por su cuenta", async () => {
  // El saldo de un bono solo se mueve con asiento en SessionLedger. Ninguna de
  // las tablas de cobro que añade este lote toca `Subscription.sessionsRemaining`,
  // y esta prueba lo deja escrito para que siga siendo verdad.
  const tablasNuevas = [
    "SepaMandate",
    "PaymentDispute",
    "StripePayout",
    "StripeCoupon",
    "AccessAttempt",
    "AccountDeletionRequest",
  ];
  const columnas = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_name = ANY(${tablasNuevas})
  `;

  const sospechosas = columnas.filter((columna) => /sessionsRemaining/i.test(columna.column_name));
  assert.deepEqual(sospechosas, []);
});
