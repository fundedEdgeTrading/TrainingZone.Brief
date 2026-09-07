import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getScreeningDraftForMember, reconcileScreeningFromAssessment } from "@/lib/health-access";
import { INJURY_ZONE_TO_PAIN_ZONE } from "@/lib/assessments/schemas";
import type { InjuryZone } from "@prisma/client";

/**
 * E3-06 · La revisión de valoración vuelve a preguntar por lesiones.
 *
 * `reviewAssessmentSchema` no llevaba screening ni zonas de dolor, así que una
 * lumbalgia que aparecía en el mes 4 solo entraba en el semáforo si alguien la
 * tecleaba a mano en la ficha.
 */

const SLUG = "e2e-review-screening-test";
const RECONCILABLE = Object.keys(INJURY_ZONE_TO_PAIN_ZONE) as InjuryZone[];

type Fixture = { orgId: string; memberId: string; trainerId: string; assessmentId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Revisión", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro revisión", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Revisión",
      email: `${SLUG}@example.com`,
      consentHealth: true,
      consentHealthAt: new Date(),
    },
  });
  const email = `${SLUG}-trainer@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const trainer = await prisma.user.create({
    data: { orgId: org.id, identityId: identity.id, name: "Entrenador", email, role: "TRAINER" },
  });
  const assessment = await prisma.assessment.create({
    data: { orgId: org.id, memberId: member.id, kind: "M1", dueDate: new Date(), answers: {} },
  });

  // Estado de partida: hombro derecho vigente, más una lesión de codo que el
  // cuestionario NO sabe preguntar.
  await prisma.healthRecord.createMany({
    data: [
      { memberId: member.id, type: "INJURY", zoneCode: "HOMBRO", side: "DERECHA", description: "Tendinopatía", severity: "MEDIUM" },
      { memberId: member.id, type: "INJURY", zoneCode: "CODO", side: "IZQUIERDA", description: "Epicondilitis", severity: "LOW" },
    ],
  });

  fx = { orgId: org.id, memberId: member.id, trainerId: trainer.id, assessmentId: assessment.id };
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.assessment.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.healthRecord.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.memberProgressEntry.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

function reconciliation(zones: { zoneCode: InjuryZone; side: "IZQUIERDA" | "DERECHA" | "NO_APLICA" }[]) {
  return {
    injuries: zones.map((z) => ({ ...z, description: "Declarado en la revisión", severity: "MEDIUM" as const })),
    conditions: [],
    reconcilableZones: RECONCILABLE,
  };
}

test("E3-06 · la revisión llega precargada con lo que ya consta", async () => {
  const draft = await getScreeningDraftForMember({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
  });

  assert.deepEqual(draft?.zonasDolor, ["HOMBRO"], "el codo no aparece: el cuestionario no lo pregunta");
  assert.equal(draft?.lateralidadDolor?.HOMBRO, "DERECHA");
});

test("E3-06 · una zona nueva crea su HealthRecord y el semáforo lo recoge", async () => {
  const result = await reconcileScreeningFromAssessment({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    assessmentId: fx.assessmentId,
    screening: reconciliation([
      { zoneCode: "HOMBRO", side: "DERECHA" },
      { zoneCode: "LUMBAR", side: "NO_APLICA" },
    ]),
  });

  assert.deepEqual(result, { ok: true, created: 1, resolved: 0 });
  const lumbar = await prisma.healthRecord.findFirstOrThrow({
    where: { memberId: fx.memberId, zoneCode: "LUMBAR" },
  });
  assert.equal(lumbar.status, "ACTIVE", "vigente: es lo que enciende el semáforo");
});

test("E3-06 · repetir la revisión sin cambios no duplica ningún registro", async () => {
  const before = await prisma.healthRecord.count({ where: { memberId: fx.memberId } });

  const result = await reconcileScreeningFromAssessment({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    assessmentId: fx.assessmentId,
    screening: reconciliation([
      { zoneCode: "HOMBRO", side: "DERECHA" },
      { zoneCode: "LUMBAR", side: "NO_APLICA" },
    ]),
  });

  assert.deepEqual(result, { ok: true, created: 0, resolved: 0 });
  assert.equal(await prisma.healthRecord.count({ where: { memberId: fx.memberId } }), before);
});

test("E3-06 · desmarcar una zona la resuelve con fecha, no la borra", async () => {
  const result = await reconcileScreeningFromAssessment({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
    assessmentId: fx.assessmentId,
    screening: reconciliation([{ zoneCode: "LUMBAR", side: "NO_APLICA" }]),
  });

  assert.deepEqual(result, { ok: true, created: 0, resolved: 1 });

  const hombro = await prisma.healthRecord.findFirstOrThrow({
    where: { memberId: fx.memberId, zoneCode: "HOMBRO" },
  });
  assert.equal(hombro.status, "RESOLVED", "sigue existiendo: el histórico clínico no se reescribe");
  assert.ok(hombro.resolvedAt instanceof Date, "con fecha de alta");

  const traza = await prisma.auditLog.findFirst({
    where: { orgId: fx.orgId, action: "HEALTH_RECORD_STATUS_CHANGED", entityId: hombro.id },
  });
  assert.equal(traza?.actorUserId, fx.trainerId);
});

test("E3-06 · una lesión que el cuestionario no sabe preguntar no se resuelve por omisión", async () => {
  const codo = await prisma.healthRecord.findFirstOrThrow({
    where: { memberId: fx.memberId, zoneCode: "CODO" },
  });
  // Tres reconciliaciones sin marcar el codo (el formulario ni lo ofrece) y la
  // epicondilitis sigue vigente. Resolverla habría sido inventarse un alta.
  assert.equal(codo.status, "ACTIVE");
});
