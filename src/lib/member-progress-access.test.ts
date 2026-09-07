import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getProgressEntriesForMember, getOwnProgressEntries } from "@/lib/health-access";

/**
 * E10-02 · `MemberProgressEntry` pasa por `health-access.ts`.
 *
 * Era la brecha de datos de salud más probable del sistema y la que peor se
 * defendía: el propio esquema documentaba la regla que el código incumplía
 * (*"Dato Art. 9 RGPD: mismo tratamiento que HealthRecord"*). Recepción veía
 * composición corporal y las fotos frontal, de perfil y de espalda de cualquier
 * socio de su ámbito, sin dejar rastro.
 */

const SLUG = "e2e-progress-access-test";

type Fixture = { orgId: string; otherOrgId: string; memberId: string; trainerId: string; receptionId: string };
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Evolución", slug: SLUG } });
  const other = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: "Centro evolución", slug: `${SLUG}-centro` },
  });
  const member = await prisma.member.create({
    data: {
      orgId: org.id,
      primaryCenterId: center.id,
      firstName: "Socia",
      lastName: "Evolución",
      email: `${SLUG}@example.com`,
      consentHealth: true,
      consentHealthAt: new Date(),
    },
  });
  await prisma.memberProgressEntry.create({
    data: {
      memberId: member.id,
      weightKg: 62,
      bodyFatPct: 29,
      photoFrontUrl: "https://example.invalid/frontal.jpg",
    },
  });

  const makeUser = async (tag: string, role: "TRAINER" | "RECEPTION") => {
    const email = `${SLUG}-${tag}@example.com`;
    const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
    return prisma.user.create({ data: { orgId: org.id, identityId: identity.id, name: tag, email, role } });
  };
  const trainer = await makeUser("trainer", "TRAINER");
  const reception = await makeUser("reception", "RECEPTION");

  fx = {
    orgId: org.id,
    otherOrgId: other.id,
    memberId: member.id,
    trainerId: trainer.id,
    receptionId: reception.id,
  };
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: { in: [fx.orgId, fx.otherOrgId] } } });
  await prisma.memberProgressEntry.deleteMany({ where: { memberId: fx.memberId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: { in: [fx.orgId, fx.otherOrgId] } } });
  await prisma.$disconnect();
});

test("E10-02 · recepción no recibe la evolución, y no se revela que exista", async () => {
  const entries = await getProgressEntriesForMember({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.receptionId,
    actorRole: "RECEPTION",
  });

  assert.equal(entries, null, "ni las fotos ni la composición viajan en la respuesta");
});

test("E10-02 · el entrenador sí la ve, y ahora deja traza", async () => {
  const before = await prisma.auditLog.count({
    where: { orgId: fx.orgId, action: "MEMBER_PROGRESS_READ" },
  });

  const entries = await getProgressEntriesForMember({
    memberId: fx.memberId,
    orgId: fx.orgId,
    actorUserId: fx.trainerId,
    actorRole: "TRAINER",
  });

  assert.equal(entries?.length, 1);
  assert.equal(entries?.[0].bodyFatPct, 29);

  const traza = await prisma.auditLog.findFirst({
    where: { orgId: fx.orgId, action: "MEMBER_PROGRESS_READ", memberId: fx.memberId },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(
    await prisma.auditLog.count({ where: { orgId: fx.orgId, action: "MEMBER_PROGRESS_READ" } }),
    before + 1
  );
  assert.equal(traza?.actorUserId, fx.trainerId, "actor");
  assert.equal(traza?.memberId, fx.memberId, "socio");
  assert.ok(traza?.createdAt instanceof Date, "momento");
});

test("E10-02 · el ámbito de organización se aplica también aquí", async () => {
  const entries = await getProgressEntriesForMember({
    memberId: fx.memberId,
    orgId: fx.otherOrgId,
    actorUserId: fx.trainerId,
    actorRole: "OWNER",
  });

  assert.deepEqual(entries, []);
});

test("E10-02 · el socio lee lo suyo por el mismo punto único", async () => {
  const entries = await getOwnProgressEntries({ memberId: fx.memberId, orgId: fx.orgId });
  assert.equal(entries.length, 1);
  // Y desde otra organización, nada: el portal tampoco es una puerta trasera.
  assert.deepEqual(await getOwnProgressEntries({ memberId: fx.memberId, orgId: fx.otherOrgId }), []);
});
