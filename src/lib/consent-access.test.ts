import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { revokeMemberConsent } from "@/lib/consent-access";

/**
 * E12-12 · consentimientos revocables desde el panel de staff. Un socio que
 * llama por teléfono puede pedir que se retire su consentimiento de
 * imágenes; la declaración de salud NO es revocable por esta vía (E10-03).
 */

const SLUG = "e12-12-consent-test";
let orgId: string;
let memberId: string;
let actorId: string;

before(async () => {
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
  const org = await prisma.organization.create({ data: { name: "Consentimientos", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  const identity = await prisma.identity.create({ data: { email: `${SLUG}-staff@example.com`, passwordHash: "x" } });
  const actor = await prisma.user.create({
    data: { identityId: identity.id, orgId, centerId: center.id, name: "Recepción", email: identity.email, role: "RECEPTION" },
  });
  actorId = actor.id;
  const now = new Date();
  const member = await prisma.member.create({
    data: {
      orgId,
      primaryCenterId: center.id,
      firstName: "Ana",
      lastName: "Consiente",
      email: `${SLUG}-member@example.com`,
      consentImages: true,
      consentImagesAt: now,
      consentHealth: true,
      consentHealthAt: now,
    },
  });
  memberId = member.id;
});

async function cleanup() {
  if (orgId) {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.member.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  }
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
}

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("E12-12 · retirar el consentimiento de imágenes lo apaga y deja traza", async () => {
  const result = await revokeMemberConsent(orgId, actorId, memberId, "images");
  assert.equal(result.ok, true);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(member.consentImages, false);
  assert.equal(member.consentImagesAt, null);

  const logs = await prisma.auditLog.findMany({ where: { orgId, entityId: memberId, action: "CONSENT_REVOKED_BY_STAFF" } });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].actorUserId, actorId);
  assert.deepEqual(logs[0].metadata, { kind: "images", requestedBy: "member" });
});

test("E12-12 · la declaración de salud NO es revocable por esta vía", async () => {
  const result = await revokeMemberConsent(orgId, actorId, memberId, "health");
  assert.equal(result.ok, false);

  const member = await prisma.member.findUniqueOrThrow({ where: { id: memberId } });
  assert.equal(member.consentHealth, true, "el consentimiento de salud no se toca por este camino");
});
