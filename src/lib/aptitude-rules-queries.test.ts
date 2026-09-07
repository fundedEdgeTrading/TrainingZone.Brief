import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { countMembersAffectedByRules } from "@/lib/aptitude-rules-queries";

/**
 * E3-04 · La pantalla de reglas muestra "esta regla afecta hoy a N socios".
 *
 * Si sale 0 en una zona con lesiones registradas, la regla está mal escrita y se
 * ve al instante. Es el único aviso que existe de una regla que no se aplica.
 */

const SLUG = "e2e-rule-impact-test";

type Fixture = {
  orgId: string;
  centerA: string;
  centerB: string;
  ownerId: string;
  directorBId: string;
  ruleHombro: string;
  ruleHombroIzq: string;
  ruleCodo: string;
};
let fx: Fixture;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Impacto reglas", slug: SLUG } });
  const centerA = await prisma.center.create({
    data: { orgId: org.id, name: "Centro A", slug: `${SLUG}-a` },
  });
  const centerB = await prisma.center.create({
    data: { orgId: org.id, name: "Centro B", slug: `${SLUG}-b` },
  });

  const makeMember = async (tag: string, centerId: string) =>
    prisma.member.create({
      data: {
        orgId: org.id,
        primaryCenterId: centerId,
        firstName: "Socio",
        lastName: tag,
        email: `${SLUG}-${tag}@example.com`,
        consentHealth: true,
      },
    });

  // Dos socios del centro A con el hombro derecho, uno del B con el izquierdo.
  const a1 = await makeMember("a1", centerA.id);
  const a2 = await makeMember("a2", centerA.id);
  const b1 = await makeMember("b1", centerB.id);
  await prisma.healthRecord.createMany({
    data: [
      { memberId: a1.id, type: "INJURY", zoneCode: "HOMBRO", side: "DERECHA", description: "x", severity: "LOW" },
      { memberId: a2.id, type: "INJURY", zoneCode: "HOMBRO", side: "DERECHA", description: "x", severity: "LOW" },
      { memberId: b1.id, type: "INJURY", zoneCode: "HOMBRO", side: "IZQUIERDA", description: "x", severity: "LOW" },
      // Resuelta: no cuenta, ya no condiciona nada.
      {
        memberId: a1.id,
        type: "INJURY",
        zoneCode: "CODO",
        side: "DERECHA",
        description: "x",
        severity: "LOW",
        status: "RESOLVED",
      },
    ],
  });

  const makeUser = async (tag: string, role: "OWNER" | "CENTER_DIRECTOR", centerId: string | null) => {
    const email = `${SLUG}-${tag}@staff.example.com`;
    const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
    return prisma.user.create({
      data: { orgId: org.id, identityId: identity.id, name: tag, email, role, centerId },
    });
  };
  const owner = await makeUser("owner", "OWNER", null);
  const directorB = await makeUser("directorb", "CENTER_DIRECTOR", centerB.id);

  const ruleHombro = await prisma.aptitudeRule.create({
    data: { orgId: org.id, injuryZone: "Hombro", zoneCode: "HOMBRO", blockArea: "Empuje vertical", light: "RED" },
  });
  const ruleHombroIzq = await prisma.aptitudeRule.create({
    data: {
      orgId: org.id,
      injuryZone: "Hombro izquierdo",
      zoneCode: "HOMBRO",
      side: "IZQUIERDA",
      blockArea: "Empuje horizontal",
      light: "AMBER",
    },
  });
  // Regla de codo: hay una lesión de codo registrada, pero está RESUELTA, así
  // que la regla no llega a nadie. Es exactamente el caso de "posible error".
  const ruleCodo = await prisma.aptitudeRule.create({
    data: { orgId: org.id, injuryZone: "Codo", zoneCode: "CODO", blockArea: "Tracción", light: "AMBER" },
  });

  fx = {
    orgId: org.id,
    centerA: centerA.id,
    centerB: centerB.id,
    ownerId: owner.id,
    directorBId: directorB.id,
    ruleHombro: ruleHombro.id,
    ruleHombroIzq: ruleHombroIzq.id,
    ruleCodo: ruleCodo.id,
  };
});

after(async () => {
  if (!fx) return;
  await prisma.auditLog.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.healthRecord.deleteMany({ where: { member: { orgId: fx.orgId } } });
  await prisma.aptitudeRule.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.member.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.centerMembership.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.user.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: fx.orgId } });
  await prisma.organization.deleteMany({ where: { id: fx.orgId } });
  await prisma.$disconnect();
});

test("E3-04 · cada regla dice a cuántos socios afecta hoy", async () => {
  const impact = await countMembersAffectedByRules({
    id: fx.ownerId,
    role: "OWNER",
    orgId: fx.orgId,
    centerId: null,
  });

  // La regla sin lado alcanza los tres hombros; la lateralizada, solo el izquierdo.
  assert.equal(impact.get(fx.ruleHombro)?.affectedMembers, 3);
  assert.equal(impact.get(fx.ruleHombroIzq)?.affectedMembers, 1);
});

test("E3-04 · una regla con 0 socios y lesiones en su zona se marca como posible error", async () => {
  const impact = await countMembersAffectedByRules({
    id: fx.ownerId,
    role: "OWNER",
    orgId: fx.orgId,
    centerId: null,
  });

  const codo = impact.get(fx.ruleCodo);
  assert.equal(codo?.affectedMembers, 0);
  assert.equal(codo?.orphan, false, "la única lesión de codo está resuelta: no hay casos vigentes que contar");

  // Con un caso vigente en la zona, el 0 sí es sospechoso.
  const socio = await prisma.member.findFirstOrThrow({ where: { orgId: fx.orgId, lastName: "b1" } });
  const vigente = await prisma.healthRecord.create({
    data: {
      memberId: socio.id,
      type: "INJURY",
      zoneCode: "CODO",
      side: "IZQUIERDA",
      description: "x",
      severity: "LOW",
    },
  });
  await prisma.aptitudeRule.update({ where: { id: fx.ruleCodo }, data: { side: "DERECHA" } });

  const after = await countMembersAffectedByRules({
    id: fx.ownerId,
    role: "OWNER",
    orgId: fx.orgId,
    centerId: null,
  });
  assert.deepEqual(after.get(fx.ruleCodo), { affectedMembers: 0, orphan: true });

  await prisma.healthRecord.delete({ where: { id: vigente.id } });
  await prisma.aptitudeRule.update({ where: { id: fx.ruleCodo }, data: { side: null } });
});

test("E3-04 · el recuento respeta el ámbito de centro de quien mira", async () => {
  const impact = await countMembersAffectedByRules({
    id: fx.directorBId,
    role: "CENTER_DIRECTOR",
    orgId: fx.orgId,
    centerId: fx.centerB,
  });

  // Dirección del centro B solo cuenta a su socio, no a los dos del centro A.
  assert.equal(impact.get(fx.ruleHombro)?.affectedMembers, 1);
  assert.equal(impact.get(fx.ruleHombroIzq)?.affectedMembers, 1);
});
