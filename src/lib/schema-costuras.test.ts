import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";

/**
 * Costuras del servidor · Ola 0 (S0-A). Lo que se comprueba aquí es el ESQUEMA,
 * no una pantalla: son las garantías que las nueve pistas del trimestre dan por
 * supuestas y que, si se rompen, se rompen en silencio.
 *
 *  · E10-14 · `AuditLog` append-only por construcción, no por convención.
 *  · E2-15  · un asiento de bono nunca mueve cero sesiones.
 *  · E10-08 · el plazo de conservación no baja del suelo legal.
 *  · HU-ST-05 · un `event.id` de Stripe no se procesa dos veces.
 *  · HU-ST-14 · `PAUSED` (voluntaria) es un estado distinto de `FROZEN` (impago).
 *  · E3-02  · zona de lesión de lista cerrada, con la lateralidad aparte.
 */

const SLUG = "e2e-costuras-servidor-test";

type Fixture = { orgId: string; centerId: string; memberId: string; userId: string; planId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Costuras", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro costuras", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Costuras",
      email: `${SLUG}@example.com`,
    },
  });
  const identity = await prisma.identity.create({
    data: { email: `${SLUG}-staff@example.com`, passwordHash: "no-usable-en-tests" },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      identityId: identity.id,
      name: "Recepción costuras",
      email: `${SLUG}-staff@example.com`,
      role: "RECEPTION",
    },
  });
  const plan = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Bono costuras", type: "SESSION_PACK", sessionsIncluded: 8, priceCents: 32000 },
  });
  fx = { orgId: org.id, centerId: center.id, memberId: member.id, userId: user.id, planId: plan.id };
});

after(async () => {
  if (!fx) return;
  await prisma.sessionLedger.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.retentionPolicy.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.stripeWebhookEvent.deleteMany({ where: { id: { startsWith: `evt_${SLUG}` } } });
  await prisma.subscription.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.healthRecord.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.membershipPlan.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

// ---------------------------------------------------------------------------
// E10-14 · AuditLog append-only
// ---------------------------------------------------------------------------

test("E10-14 · una entrada de auditoría no se puede modificar", async () => {
  const entry = await prisma.auditLog.create({
    data: {
      orgId: fx.orgId,
      actorUserId: fx.userId,
      action: "HEALTH_RECORD_READ",
      entityType: "Member",
      entityId: fx.memberId,
      memberId: fx.memberId,
    },
  });

  await assert.rejects(
    () => prisma.auditLog.update({ where: { id: entry.id }, data: { action: "NADA_QUE_VER" } }),
    /append-only/i,
    "quien es auditado no puede reescribir su propia traza"
  );

  // Y no es que se haya escrito y luego revertido: la fila sigue como estaba.
  const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
  assert.equal(after.action, "HEALTH_RECORD_READ");
});

test("E10-14 · la migración de producción ejecuta REVOKE UPDATE, DELETE", () => {
  const sql = readFileSync("prisma/migrations/20260906120000_costuras_servidor_q3/migration.sql", "utf8");
  assert.match(sql, /REVOKE UPDATE, DELETE ON TABLE "AuditLog"/);
});

test("E10-14 · borrar al usuario anonimiza el actor sin tocar el contenido", async () => {
  const identity = await prisma.identity.create({
    data: { email: `${SLUG}-efimero@example.com`, passwordHash: "no-usable-en-tests" },
  });
  const ephemeral = await prisma.user.create({
    data: {
      orgId: fx.orgId,
      identityId: identity.id,
      name: "Usuario efímero",
      email: `${SLUG}-efimero@example.com`,
      role: "MEMBER",
    },
  });
  const entry = await prisma.auditLog.create({
    data: {
      orgId: fx.orgId,
      actorUserId: ephemeral.id,
      action: "MEMBER_UPDATED",
      entityType: "Member",
      entityId: fx.memberId,
      memberId: fx.memberId,
    },
  });

  // El derecho de supresión suelta el actor por integridad referencial (ON
  // DELETE SET NULL). La aplicación no ejecuta ningún UPDATE: anota una fila.
  await prisma.user.delete({ where: { id: ephemeral.id } });
  await prisma.identity.delete({ where: { id: identity.id } });

  const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: entry.id } });
  assert.equal(after.actorUserId, null, "el actor se suelta");
  assert.equal(after.action, "MEMBER_UPDATED", "lo que dice la entrada no cambia");
  assert.equal(after.entityId, fx.memberId);
});

// ---------------------------------------------------------------------------
// E2-15 · Libro mayor de sesiones
// ---------------------------------------------------------------------------

test("E2-15 · el asiento del bono se escribe, y nunca mueve cero", async () => {
  const subscription = await prisma.subscription.create({
    data: {
      memberId: fx.memberId,
      planId: fx.planId,
      centerId: fx.centerId,
      startDate: new Date(),
      priceCents: 32000,
      sessionsIncluded: 8,
      sessionsRemaining: 8,
    },
  });

  const asiento = await prisma.sessionLedger.create({
    data: {
      orgId: fx.orgId,
      subscriptionId: subscription.id,
      delta: -1,
      balanceAfter: 7,
      reason: "BOOKING",
      actorUserId: fx.userId,
    },
  });
  assert.equal(asiento.delta, -1);
  assert.equal(asiento.balanceAfter, 7);

  await assert.rejects(
    () =>
      prisma.sessionLedger.create({
        data: { orgId: fx.orgId, subscriptionId: subscription.id, delta: 0, reason: "MANUAL_ADJUSTMENT" },
      }),
    "un asiento que no mueve saldo no es un asiento"
  );
});

// ---------------------------------------------------------------------------
// E10-08 · Plazos de conservación
// ---------------------------------------------------------------------------

test("E10-08 · el plazo es parametrizable, pero no por debajo del mínimo legal", async () => {
  const policy = await prisma.retentionPolicy.create({
    data: {
      orgId: fx.orgId,
      category: "CONTRACT_BILLING",
      retentionDays: 365 * 6, // art. 30 CCom
      minimumLegalDays: 365 * 4, // art. 66 LGT
    },
  });
  assert.equal(policy.retentionDays, 365 * 6);

  await assert.rejects(
    () => prisma.retentionPolicy.update({ where: { id: policy.id }, data: { retentionDays: 30 } }),
    "configurar el plazo no puede servir para saltarse el suelo legal"
  );
});

// ---------------------------------------------------------------------------
// HU-ST-05 · Deduplicación de eventos de Stripe
// ---------------------------------------------------------------------------

test("HU-ST-05 · el mismo event.id no entra dos veces", async () => {
  const id = `evt_${SLUG}_1`;
  await prisma.stripeWebhookEvent.create({ data: { id, type: "checkout.session.completed", account: "acct_test" } });

  await assert.rejects(
    () => prisma.stripeWebhookEvent.create({ data: { id, type: "checkout.session.completed" } }),
    "la reentrega choca contra la clave primaria: es la idempotencia"
  );

  const stored = await prisma.stripeWebhookEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.processedAt, null, "se inserta ANTES de procesar; si falla, Stripe reintenta");
});

// ---------------------------------------------------------------------------
// HU-ST-14 · PAUSED distinto de FROZEN
// ---------------------------------------------------------------------------

test("HU-ST-14 · congelar por vacaciones no es lo mismo que no pagar", async () => {
  const paused = await prisma.subscription.create({
    data: {
      memberId: fx.memberId,
      planId: fx.planId,
      centerId: fx.centerId,
      startDate: new Date(),
      priceCents: 32000,
      status: "PAUSED",
      pauseUntil: new Date("2026-09-30T00:00:00.000Z"),
    },
  });
  assert.equal(paused.status, "PAUSED");

  // La lista de morosos busca impagos: un socio congelado a petición propia no
  // aparece en ella.
  const morosos = await prisma.subscription.findMany({
    where: { memberId: fx.memberId, status: "FROZEN" },
    select: { id: true },
  });
  assert.equal(morosos.some((s) => s.id === paused.id), false);
});

// ---------------------------------------------------------------------------
// E3-02 · Zona cerrada + lateralidad aparte
// ---------------------------------------------------------------------------

test("E3-02 · la zona es de lista cerrada y el lado es un campo propio", async () => {
  const record = await prisma.healthRecord.create({
    data: {
      memberId: fx.memberId,
      type: "INJURY",
      zoneCode: "RODILLA",
      side: "DERECHA",
      description: "Condropatía",
      severity: "MEDIUM",
    },
  });
  assert.equal(record.zoneCode, "RODILLA");
  assert.equal(record.side, "DERECHA");

  // Las dos rodillas son la MISMA zona: una regla de aptitud declarada por zona
  // encuentra las dos, que es justo lo que el texto libre impedía.
  const izquierda = await prisma.healthRecord.create({
    data: {
      memberId: fx.memberId,
      type: "INJURY",
      zoneCode: "RODILLA",
      side: "IZQUIERDA",
      description: "Menisco",
      severity: "HIGH",
    },
  });
  const rodillas = await prisma.healthRecord.findMany({
    where: { memberId: fx.memberId, zoneCode: "RODILLA" },
    select: { id: true },
  });
  assert.equal(rodillas.length, 2);
  assert.ok(rodillas.some((r) => r.id === izquierda.id));
});
