import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { getHealthRecordsForMember } from "@/lib/health-access";

/**
 * E1-08 · `getHealthRecordsForMember` acota por `orgId`.
 *
 * No es explotable hoy: los dos llamantes validan la pertenencia. Es exactamente
 * por eso que hay que arreglarlo ANTES de que aparezca un tercer llamante — y
 * este test es lo que hace que ese tercero no pueda abrir la fuga en silencio.
 */

const SLUG = "e2e-health-scope-test";

type Fixture = { orgA: string; orgB: string; memberB: string; trainerA: string };
let fx: Fixture;

async function makeOrg(tag: string) {
  const org = await prisma.organization.create({ data: { name: `Ámbito ${tag}`, slug: `${SLUG}-${tag}` } });
  const center = await prisma.center.create({
    data: { orgId: org.id, name: `Centro ${tag}`, slug: `${SLUG}-${tag}-centro` },
  });
  return { org, center };
}

before(async () => {
  const a = await makeOrg("a");
  const b = await makeOrg("b");

  const memberB = await prisma.member.create({
    data: {
      orgId: b.org.id,
      primaryCenterId: b.center.id,
      firstName: "Socia",
      lastName: "Ajena",
      email: `${SLUG}-b@example.com`,
      consentHealth: true,
      consentHealthAt: new Date(),
    },
  });
  await prisma.healthRecord.create({
    data: {
      memberId: memberB.id,
      type: "INJURY",
      zoneCode: "RODILLA",
      side: "DERECHA",
      description: "Rotura de menisco",
      severity: "HIGH",
    },
  });

  const email = `${SLUG}-trainer-a@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  const trainerA = await prisma.user.create({
    data: { orgId: a.org.id, identityId: identity.id, name: "Entrenador A", email, role: "TRAINER" },
  });

  fx = { orgA: a.org.id, orgB: b.org.id, memberB: memberB.id, trainerA: trainerA.id };
});

after(async () => {
  if (!fx) return;
  for (const orgId of [fx.orgA, fx.orgB]) {
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.healthRecord.deleteMany({ where: { member: { orgId } } });
    await prisma.member.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  }
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.$disconnect();
});

test("E1-08 · un memberId de otra organización devuelve lista vacía, nunca registros", async () => {
  const records = await getHealthRecordsForMember({
    memberId: fx.memberB,
    orgId: fx.orgA, // el ámbito de quien pregunta, no el del socio
    actorUserId: fx.trainerA,
    actorRole: "TRAINER",
  });

  assert.deepEqual(records, [], "un fallo aguas arriba no puede convertirse en una fuga entre clientes");
});

test("E1-08 · la llamada legítima no cambia de comportamiento", async () => {
  const records = await getHealthRecordsForMember({
    memberId: fx.memberB,
    orgId: fx.orgB,
    actorUserId: fx.trainerA,
    actorRole: "TRAINER",
  });

  assert.equal(records?.length, 1);
  assert.equal(records?.[0].description, "Rotura de menisco");
});

test("E1-08 · el rol sin autorización sigue recibiendo null, no una lista vacía", async () => {
  // La diferencia importa: `null` es "no te corresponde", `[]` es "no hay nada".
  // Recepción no puede distinguir si el socio existe.
  const records = await getHealthRecordsForMember({
    memberId: fx.memberB,
    orgId: fx.orgB,
    actorUserId: fx.trainerA,
    actorRole: "RECEPTION",
  });

  assert.equal(records, null);
});
