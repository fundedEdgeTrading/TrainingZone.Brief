import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createHealthRecord, updateHealthRecordStatus } from "@/lib/health-access";
import { OPEN_HEALTH_STATUSES, injuryTimeline, isOpenHealthStatus } from "@/lib/health-status";

/**
 * Fases de una lesión contra la base de datos real. Lo que se verifica aquí no
 * se puede verificar con funciones puras:
 *
 *  1. Que los registros que YA existían siguen leyéndose igual después de la
 *     migración — es aditiva, y una fila escrita con el modelo viejo (sin fecha
 *     de lesión, ACTIVE o RESOLVED) tiene que seguir significando lo mismo.
 *  2. Que cada cambio de fase deja rastro de quién y cuándo en `AuditLog`, que
 *     es dónde vive el histórico (el registro solo guarda el último cambio).
 *  3. Que `resolvedAt` no se queda colgado cuando una lesión recae.
 *
 * Cada test monta su propia organización y la borra al terminar, así que no
 * depende de los datos de demo ni los ensucia.
 */

const SLUG = "e2e-health-phases-test";

type Fixture = { orgId: string; memberId: string; trainerId: string; receptionId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Salud fases", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro fases", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Fases",
      email: `${SLUG}@example.com`,
      // Sin consentimiento de salud no se puede ni registrar (Art. 9 RGPD).
      consentHealth: true,
      consentHealthAt: new Date(),
    },
  });
  // Cada usuario cuelga de una identidad (ADR de identidad/membresía): sin ella
  // no se puede crear personal, aunque a este test solo le importe el rol.
  const makeUser = async (tag: string, role: "TRAINER" | "RECEPTION") => {
    const email = `${SLUG}-${tag}@example.com`;
    const identity = await prisma.identity.create({
      data: { email, passwordHash: "no-usable-en-tests" },
    });
    return prisma.user.create({
      data: { orgId: org.id, identityId: identity.id, name: tag, email, role },
    });
  };
  const trainer = await makeUser("trainer", "TRAINER");
  const reception = await makeUser("reception", "RECEPTION");
  fx = { orgId: org.id, memberId: member.id, trainerId: trainer.id, receptionId: reception.id };
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.healthRecord.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

/** Fila escrita como la escribía el modelo ANTERIOR a la migración: sin ninguna
 *  de las columnas nuevas. Es la forma de comprobar los defaults de verdad —
 *  por el cliente de Prisma no se puede omitir una columna con default. */
async function insertLegacyRecord(status: "ACTIVE" | "RESOLVED", resolvedAt: Date | null) {
  const id = `${SLUG}-legacy-${status.toLowerCase()}`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "HealthRecord" ("id","memberId","type","zone","description","severity","status","reportedByUserId","reportedAt","resolvedAt","consentSignedAt")
     VALUES ($1,$2,'INJURY'::"HealthRecordType",$3,$4,'MEDIUM'::"HealthSeverity",$5::"HealthStatus",$6,$7,$8,$7)`,
    id,
    fx.memberId,
    "hombro derecho",
    `Lesión antigua (${status})`,
    status,
    fx.trainerId,
    new Date("2026-02-10T09:00:00.000Z"),
    resolvedAt
  );
  return id;
}

test("migración: un registro anterior sigue significando lo mismo", async () => {
  const id = await insertLegacyRecord("ACTIVE", null);
  const record = await prisma.healthRecord.findUniqueOrThrow({ where: { id } });

  assert.equal(record.status, "ACTIVE", "la fase que ya tenía no se toca");
  assert.equal(record.injuryDate, null, "nadie capturó la fecha: no se inventa a partir de reportedAt");
  assert.equal(record.injuryDateApprox, false);
  assert.equal(record.statusChangedAt, null);

  // Y sigue contando como vigente allí donde antes se filtraba por "ACTIVE".
  assert.equal(isOpenHealthStatus(record.status), true);
  const open = await prisma.healthRecord.findMany({
    where: { memberId: fx.memberId, status: { in: OPEN_HEALTH_STATUSES } },
    select: { id: true },
  });
  assert.ok(open.some((r) => r.id === id));

  // Sin fecha de lesión la ficha lo dice, en vez de fingir un "hace X" falso.
  const timeline = injuryTimeline(record);
  assert.equal(timeline.label, "Fecha de lesión no registrada");
  assert.equal(timeline.exact, false);
});

test("migración: una lesión ya resuelta se queda fuera de lo vigente", async () => {
  const resolvedAt = new Date("2026-03-01T09:00:00.000Z");
  const id = await insertLegacyRecord("RESOLVED", resolvedAt);
  const record = await prisma.healthRecord.findUniqueOrThrow({ where: { id } });

  assert.equal(record.status, "RESOLVED");
  assert.equal(record.resolvedAt?.getTime(), resolvedAt.getTime());
  assert.equal(isOpenHealthStatus(record.status), false);

  const open = await prisma.healthRecord.findMany({
    where: { memberId: fx.memberId, status: { in: OPEN_HEALTH_STATUSES } },
    select: { id: true },
  });
  assert.equal(open.some((r) => r.id === id), false);
});

test("alta con fecha de lesión aproximada: el transcurrido sale de ella", async () => {
  const result = await createHealthRecord({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    input: {
      type: "INJURY",
      zone: "zona lumbar",
      description: "Lumbalgia recurrente",
      severity: "MEDIUM",
      injuryDate: new Date(2026, 4, 1),
      injuryDateApprox: true,
    },
  });
  assert.deepEqual(result, { ok: true });

  const record = await prisma.healthRecord.findFirstOrThrow({
    where: { memberId: fx.memberId, zone: "zona lumbar" },
  });
  assert.equal(record.status, "ACTIVE", "toda alta entra como activa");
  assert.equal(record.injuryDateApprox, true);
  assert.ok(record.injuryDate);
  // Registrada hoy, lesión de mayo: el "hace X" NO puede salir de reportedAt.
  assert.equal(injuryTimeline(record, new Date(2026, 7, 29)).elapsed, "hace 3 meses");
  assert.equal(injuryTimeline(record, new Date(2026, 7, 29)).label, "Lesión mayo de 2026");
});

test("el ciclo de fases se recorre entero y cada salto deja quién y cuándo", async () => {
  const created = await prisma.healthRecord.create({
    data: {
      memberId: fx.memberId,
      type: "INJURY",
      zone: "rodilla izquierda",
      description: "Esguince de ligamento lateral",
      severity: "HIGH",
      reportedByUserId: fx.trainerId,
      consentSignedAt: new Date(),
    },
  });
  assert.equal(created.status, "ACTIVE");

  const args = {
    recordId: created.id,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER" as const,
  };

  assert.deepEqual(await updateHealthRecordStatus({ ...args, status: "IN_REHAB" }), { ok: true });
  let record = await prisma.healthRecord.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(record.status, "IN_REHAB");
  assert.ok(record.statusChangedAt, "en rehabilitación desde: se guarda para poder enseñarlo");
  assert.equal(record.resolvedAt, null, "todavía no hay alta");

  assert.deepEqual(await updateHealthRecordStatus({ ...args, status: "RESOLVED" }), { ok: true });
  record = await prisma.healthRecord.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(record.status, "RESOLVED");
  assert.ok(record.resolvedAt);

  const audit = await prisma.auditLog.findMany({
    where: { entityType: "HealthRecord", entityId: created.id, action: "HEALTH_RECORD_STATUS_CHANGED" },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(audit.length, 2, "un apunte por salto, no uno por registro");
  assert.deepEqual(
    audit.map((a) => a.metadata),
    [
      { from: "ACTIVE", to: "IN_REHAB" },
      { from: "IN_REHAB", to: "RESOLVED" },
    ]
  );
  assert.ok(audit.every((a) => a.actorUserId === fx.trainerId), "quién");
  assert.ok(audit.every((a) => a.memberId === fx.memberId));
  assert.ok(audit.every((a) => a.createdAt instanceof Date), "cuándo");

  // Recaída: al salir de RESOLVED, el alta médica deja de ser cierta.
  assert.deepEqual(await updateHealthRecordStatus({ ...args, status: "IN_REHAB" }), { ok: true });
  record = await prisma.healthRecord.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(record.status, "IN_REHAB");
  assert.equal(record.resolvedAt, null, "una lesión vigente no puede tener fecha de resolución");

  // Repetir la fase que ya tiene no escribe ni audita.
  assert.deepEqual(await updateHealthRecordStatus({ ...args, status: "IN_REHAB" }), { ok: true });
  const auditAfter = await prisma.auditLog.count({
    where: { entityType: "HealthRecord", entityId: created.id, action: "HEALTH_RECORD_STATUS_CHANGED" },
  });
  assert.equal(auditAfter, 3);
});

test("crónica: la fase se marca y el registro sigue vigente para siempre", async () => {
  const created = await prisma.healthRecord.create({
    data: {
      memberId: fx.memberId,
      type: "INJURY",
      zone: "cervicales",
      description: "Hernia cervical con limitación permanente",
      severity: "HIGH",
      reportedByUserId: fx.trainerId,
      consentSignedAt: new Date(),
    },
  });

  assert.deepEqual(
    await updateHealthRecordStatus({
      recordId: created.id,
      orgId: fx.orgId,
      actorUserId: fx.trainerId,
      actorRole: "TRAINER",
      status: "CHRONIC",
    }),
    { ok: true }
  );

  const record = await prisma.healthRecord.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(record.status, "CHRONIC");
  assert.equal(record.resolvedAt, null);
  assert.equal(isOpenHealthStatus(record.status), true, "una crónica no deja de limitar el entrenamiento");
});

test("sin permiso de edición de salud no se cambia la fase", async () => {
  const created = await prisma.healthRecord.create({
    data: {
      memberId: fx.memberId,
      type: "INJURY",
      zone: "tobillo derecho",
      description: "Esguince leve",
      severity: "LOW",
      reportedByUserId: fx.trainerId,
      consentSignedAt: new Date(),
    },
  });

  const result = await updateHealthRecordStatus({
    recordId: created.id,
    orgId: fx.orgId,
    actorUserId: fx.receptionId,
    actorRole: "RECEPTION",
    status: "RESOLVED",
  });
  assert.deepEqual(result, { ok: false, error: "forbidden" });

  const record = await prisma.healthRecord.findUniqueOrThrow({ where: { id: created.id } });
  assert.equal(record.status, "ACTIVE", "no se ha tocado");
});

test("el registro de otra organización no existe para este actor", async () => {
  const other = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  const otherCenter = await prisma.center.create({
    data: { orgId: other.id, name: "Otro centro", slug: `${SLUG}-otra-centro` },
  });
  const otherMember = await prisma.member.create({
    data: {
      orgId: other.id,
      primaryCenterId: otherCenter.id,
      firstName: "Ajeno",
      lastName: "Ajeno",
      email: `${SLUG}-otra@example.com`,
    },
  });
  const otherRecord = await prisma.healthRecord.create({
    data: { memberId: otherMember.id, type: "INJURY", description: "Ajena", severity: "LOW" },
  });

  const result = await updateHealthRecordStatus({
    recordId: otherRecord.id,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    status: "RESOLVED",
  });
  assert.deepEqual(result, { ok: false, error: "not_found" });

  await prisma.healthRecord.deleteMany({ where: { memberId: otherMember.id } });
  await prisma.member.deleteMany({ where: { orgId: other.id } });
  await prisma.center.deleteMany({ where: { orgId: other.id } });
  await prisma.organization.deleteMany({ where: { id: other.id } });
});
