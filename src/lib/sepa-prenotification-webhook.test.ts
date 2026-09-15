import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { sendSepaPrenotification } from "@/lib/sepa-prenotification";
import { runSepaPrenotificationRule } from "@/lib/sepa-prenotification-job";
import { prenotificationKey, SEPA_DEFAULT_NOTICE_DAYS } from "@/lib/sepa-prenotification";

/**
 * HU-ST-16 · Preaviso de cobro disparado por `invoice.upcoming`.
 *
 * El preaviso ya existía (E10-13) pero deducía la fecha de cargo del
 * aniversario del alta. `invoice.upcoming` trae la fecha REAL de Stripe, que es
 * lo que aporta esta historia — y trae con ella el riesgo que hay que probar:
 * **que las dos vías no avisen dos veces del mismo cargo**. El sello de "ya
 * enviado" es uno solo, compartido, y esto es lo que lo comprueba.
 */

const SUFFIX = "e2e-preaviso-test";
const DAY = 86_400;

type Fixture = {
  orgId: string;
  memberId: string;
  subscriptionId: string;
  stripeSubscriptionId: string;
};

async function createFixture(tag: string, opts: { conMandato: boolean }): Promise<Fixture> {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Preaviso ${tag}`, slug } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${slug}-centro` },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: `Cuota ${tag}`, type: "MONTHLY", priceCents: 5900 },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Ana",
      lastName: `Preaviso ${tag}`,
      email: `${slug}@example.com`,
    },
  });

  const mandate = opts.conMandato
    ? await prisma.sepaMandate.create({
        data: {
          orgId: org.id,
          memberId: member.id,
          stripeMandateId: `mandate_${slug}`,
          reference: `UMR-${tag.toUpperCase()}`,
          ibanLast4: "4321",
          status: "ACTIVE",
          acceptedAt: new Date(),
        },
      })
    : null;

  const stripeSubscriptionId = `sub_${slug}`;
  const subscription = await prisma.subscription.create({
    data: {
      memberId: member.id,
      planId: plan.id,
      centerId: center.id,
      // Alta de hace un mes justo: es lo que hace que el cron deduzca un cargo
      // inminente y pueda cruzarse con el del webhook.
      startDate: new Date(Date.now() - 30 * DAY * 1000),
      priceCents: 5900,
      stripeSubscriptionId,
      sepaMandateId: mandate?.id ?? null,
    },
  });

  return { orgId: org.id, memberId: member.id, subscriptionId: subscription.id, stripeSubscriptionId };
}

/** `invoice.upcoming` con el cargo a `days` días vista. */
function upcoming(f: Fixture, days: number): Stripe.Invoice {
  const at = Math.floor(Date.now() / 1000) + days * DAY;
  return {
    // A propósito SIN `id`: una factura próxima todavía no existe como factura,
    // y por eso la clave de idempotencia no puede salir de ella.
    subscription: f.stripeSubscriptionId,
    amount_due: 5900,
    next_payment_attempt: at,
    period_end: at,
  } as unknown as Stripe.Invoice;
}

async function avisos(orgId: string) {
  return prisma.auditLog.findMany({
    where: { orgId, entityType: "SepaPrenotification" },
    orderBy: { createdAt: "asc" },
  });
}

async function cleanup() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.updateMany({ where: { member: { orgId: org.id } }, data: { sepaMandateId: null } });
    await prisma.sepaMandate.deleteMany({ where: { orgId: org.id } });
    await prisma.payment.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("el preaviso sale una sola vez por factura, venga del webhook o del cron", async () => {
  const f = await createFixture("una-vez", { conMandato: true });

  // Stripe manda `invoice.upcoming` con el cargo dentro de la ventana y por
  // encima del suelo de 14 días del esquema SEPA Core. Un día de margen: a
  // exactamente 14 días, la antelación en días ENTEROS es 13 y el preaviso —con
  // razón— saldría marcado como tardío.
  const result = await sendSepaPrenotification(f.orgId, upcoming(f, SEPA_DEFAULT_NOTICE_DAYS + 1));
  assert.equal(result.ok, true);

  const primera = await avisos(f.orgId);
  assert.equal(primera.length, 1, "el socio recibe su aviso");
  const meta = primera[0].metadata as Record<string, unknown>;
  assert.equal(meta.amountCents, 5900, "importe");
  assert.equal(meta.sepa, true, "queda registrado que es un adeudo domiciliado");
  assert.equal(meta.source, "invoice.upcoming");
  assert.equal(meta.late, false, "por encima del plazo del esquema no es tardío");

  // Reentrega del mismo evento: Stripe entrega al menos una vez.
  await sendSepaPrenotification(f.orgId, upcoming(f, SEPA_DEFAULT_NOTICE_DAYS + 1));
  assert.equal((await avisos(f.orgId)).length, 1, "una reentrega no vuelve a avisar");
});

test("la clave del preaviso sale de la suscripción y el cargo, porque la factura aún no tiene id", async () => {
  const f = await createFixture("sin-id", { conMandato: true });
  const dias = 10;
  await sendSepaPrenotification(f.orgId, upcoming(f, dias));

  const [aviso] = await avisos(f.orgId);
  const chargeDate = new Date((aviso.metadata as { chargeDate: string }).chargeDate);
  assert.equal(aviso.entityId, prenotificationKey(f.subscriptionId, chargeDate));
});

test("un preaviso que llega tarde sale igual, pero marcado como tardío", async () => {
  const f = await createFixture("tarde", { conMandato: true });

  // A 5 días del cargo: incumple el plazo de 14. Mandarlo tarde incumple menos
  // que no mandarlo, pero no puede pasar por bueno.
  await sendSepaPrenotification(f.orgId, upcoming(f, 5));

  const [aviso] = await avisos(f.orgId);
  assert.equal((aviso.metadata as { late: boolean }).late, true);
});

test("todavía demasiado pronto: con el cargo lejos no se avisa", async () => {
  const f = await createFixture("pronto", { conMandato: true });

  await sendSepaPrenotification(f.orgId, upcoming(f, 40));

  assert.equal((await avisos(f.orgId)).length, 0, "un aviso con 40 días de antelación no es un preaviso, es ruido");
});

test("con tarjeta también se preavisa, pero sin prometer el plazo de devolución del adeudo", async () => {
  const f = await createFixture("tarjeta", { conMandato: false });

  // A 3 días: una tarjeta no está sujeta al plazo de 14 días del esquema SEPA,
  // así que el aviso sale en cuanto Stripe lo anuncia.
  await sendSepaPrenotification(f.orgId, upcoming(f, 3));

  const [aviso] = await avisos(f.orgId);
  assert.notEqual(aviso, undefined, "la historia pide preaviso de cobro, no solo de adeudo");
  const meta = aviso.metadata as Record<string, unknown>;
  assert.equal(meta.sepa, false);
  assert.equal(meta.late, false, "no hay plazo SEPA que incumplir en un cobro con tarjeta");
});

test("el cron no repite el aviso que ya mandó el webhook", async () => {
  const f = await createFixture("cron", { conMandato: true });

  // El webhook avisa del cargo que Stripe tiene previsto…
  await sendSepaPrenotification(f.orgId, upcoming(f, SEPA_DEFAULT_NOTICE_DAYS + 1));
  const key = (await avisos(f.orgId))[0].entityId;

  // …y el cron, que deduce la fecha del aniversario del alta, pasa después.
  await runSepaPrenotificationRule(f.orgId);

  const todos = await avisos(f.orgId);
  const mismos = todos.filter((a) => a.entityId === key);
  assert.equal(mismos.length, 1, "dos avisos del mismo cargo es exactamente lo que no puede pasar");
});

test("un evento de otra organización no avisa a nadie", async () => {
  const propia = await createFixture("propia", { conMandato: true });
  const ajena = await createFixture("ajena", { conMandato: true });

  await sendSepaPrenotification(ajena.orgId, upcoming(propia, SEPA_DEFAULT_NOTICE_DAYS + 1));

  assert.equal((await avisos(propia.orgId)).length, 0);
  assert.equal((await avisos(ajena.orgId)).length, 0);
});

test("una suscripción que aún no existe localmente se reintenta, no se descarta", async () => {
  const f = await createFixture("fuera-de-orden", { conMandato: true });
  const huerfana = { ...upcoming(f, 10), subscription: "sub_que_no_existe" } as unknown as Stripe.Invoice;

  const result = await sendSepaPrenotification(f.orgId, huerfana);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.retry, true);
});
