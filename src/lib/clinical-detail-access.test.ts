import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getClinicalDetailForMember } from "@/lib/health-access";

/**
 * E3-05 · El brief muestra la adaptación, no la descripción clínica cruda.
 *
 * `brief-card.tsx` imprimía la descripción de cada condición sin zona —nombres
 * de medicamentos, cirugías y patologías, literalmente— en una tarjeta abierta
 * en la sala, delante de las seis personas que entrenan al lado. La descripción
 * ya no viaja con el roster: se pide, y pedirla deja rastro.
 */

const SLUG = "e2e-clinical-detail-test";

type Fixture = { orgId: string; memberId: string; trainerId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Detalle clínico", slug: SLUG } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro detalle", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socio",
      lastName: "Detalle",
      email: `${SLUG}@example.com`,
      consentHealth: true,
      consentHealthAt: new Date(),
    },
  });
  await prisma.healthRecord.createMany({
    data: [
      { memberId: member.id, type: "MEDICATION", description: "Sintrom 4 mg", severity: "MEDIUM" },
      // Resuelta: no condiciona el entrenamiento, así que tampoco sale al abrir el detalle.
      {
        memberId: member.id,
        type: "SURGERY",
        description: "Artroscopia de menisco 2019",
        severity: "LOW",
        status: "RESOLVED",
      },
    ],
  });

  const email = `${SLUG}-trainer@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const trainer = await prisma.user.create({
    data: { orgId: org.id, identityId: identity.id, name: "Entrenador", email, role: "TRAINER" },
  });

  fx = { orgId: org.id, memberId: member.id, trainerId: trainer.id };
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

test("E3-05 · abrir el detalle clínico devuelve la descripción y escribe AuditLog", async () => {
  const records = await getClinicalDetailForMember({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
  });

  assert.equal(records?.length, 1, "solo lo vigente: la cirugía resuelta ya no condiciona nada");
  assert.equal(records?.[0].description, "Sintrom 4 mg");

  const traza = await prisma.auditLog.findFirst({
    where: { orgId: fx.orgId, action: "HEALTH_CLINICAL_DETAIL_READ", memberId: fx.memberId },
  });
  assert.equal(traza?.actorUserId, fx.trainerId);
  assert.ok(traza?.createdAt instanceof Date);
});

test("E3-05 · para un rol sin permiso el detalle no existe", async () => {
  const records = await getClinicalDetailForMember({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "RECEPTION",
  });

  // `null`, no un error: no se revela ni que el socio ni que el detalle existan.
  assert.equal(records, null);
});
