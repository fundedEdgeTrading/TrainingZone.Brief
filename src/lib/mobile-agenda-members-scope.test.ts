import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-auth";
import { GET as agendaRoute } from "@/app/api/mobile/v1/agenda/route";

/**
 * QA-RES-07 · R15: un entrenador de A que pide `/api/mobile/v1/agenda` solo ve
 * socios de su centro.
 *
 * Las sesiones ya salían acotadas al centro, pero el selector de "Cliente" de
 * la franja de EP se llenaba con `listActiveMembersForSelect(orgId)`: todos los
 * socios activos de la organización, de todos los centros. Es el patrón
 * "espejo móvil" del trimestre: la web usa `listMembersBookableInCenter`.
 */

const SLUG = "test-qa-res-07";
const URL = "http://localhost/api/mobile/v1/agenda";

type Fixture = { orgId: string; centerA: string; centerB: string; token: string; memberA: string; memberB: string; groupOnlyA: string };
let fx: Fixture;

async function wipe() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  for (const { id: orgId } of orgs) {
    await prisma.subscription.deleteMany({ where: { member: { orgId } } });
    await prisma.member.deleteMany({ where: { orgId } });
    await prisma.membershipPlan.deleteMany({ where: { orgId } });
    await prisma.centerMembership.deleteMany({ where: { orgId } });
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  await wipe();
  const org = await prisma.organization.create({
    data: { name: "Agenda móvil socios", slug: SLUG, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const centerA = await prisma.center.create({ data: { orgId: org.id, name: "Centro A", slug: `${SLUG}-a` } });
  const centerB = await prisma.center.create({ data: { orgId: org.id, name: "Centro B", slug: `${SLUG}-b` } });

  const identity = await prisma.identity.create({ data: { email: `${SLUG}-trainer@example.com`, passwordHash: "x" } });
  const trainer = await prisma.user.create({
    data: { orgId: org.id, identityId: identity.id, name: "Entrenador A", email: identity.email, role: "TRAINER", centerId: centerA.id },
  });
  await prisma.centerMembership.create({
    data: { orgId: org.id, userId: trainer.id, centerId: centerA.id, role: "TRAINER", isPrimary: true },
  });

  const ep = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "EP", type: "PERSONAL_TRAINING", sessionsIncluded: 8, priceCents: 20000 },
  });
  const group = await prisma.membershipPlan.create({
    data: { orgId: org.id, name: "Grupos", type: "SESSION_PACK", sessionsIncluded: 10, priceCents: 6000 },
  });

  const member = async (name: string, centerId: string, planId: string) => {
    const m = await prisma.member.create({
      data: { orgId: org.id, primaryCenterId: centerId, firstName: name, lastName: SLUG, email: `${SLUG}-${name}@example.com`, state: "ACTIVE" },
    });
    await prisma.subscription.create({
      data: { memberId: m.id, planId, centerId, startDate: new Date(), priceCents: 1000, sessionsIncluded: 8, sessionsRemaining: 8 },
    });
    return m.id;
  };

  fx = {
    orgId: org.id,
    centerA: centerA.id,
    centerB: centerB.id,
    token: await signAccessToken({ sub: trainer.id, role: "TRAINER", orgId: org.id, centerId: centerA.id }),
    memberA: await member("SocioA", centerA.id, ep.id),
    memberB: await member("SocioB", centerB.id, ep.id),
    groupOnlyA: await member("SoloGrupos", centerA.id, group.id),
  };
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

async function membersFrom(url: string) {
  const res = await agendaRoute(new NextRequest(url, { headers: { authorization: `Bearer ${fx.token}` } }));
  assert.equal(res.status, 200);
  const { data } = (await res.json()) as { data: { centerId: string; members: { id: string }[] } };
  return { centerId: data.centerId, ids: data.members.map((m) => m.id) };
}

test("QA-RES-07 · R15: el entrenador de A solo ve socios de su centro", async () => {
  const { centerId, ids } = await membersFrom(URL);
  assert.equal(centerId, fx.centerA);
  assert.ok(ids.includes(fx.memberA));
  assert.ok(!ids.includes(fx.memberB), "un socio de otro centro no sale en el selector");
});

test("QA-RES-07 · el selector de EP solo ofrece a quien puede ocupar una franja de EP", async () => {
  // Mismo criterio que la web (`listMembersBookableInCenter(…, "EP")`): un
  // bono de grupos no cubre una franja de entrenamiento personal.
  const { ids } = await membersFrom(URL);
  assert.ok(!ids.includes(fx.groupOnlyA));
});

test("QA-RES-07 · pedir el centro ajeno por parámetro no abre sus socios", async () => {
  const { centerId, ids } = await membersFrom(`${URL}?centerId=${fx.centerB}`);
  assert.equal(centerId, fx.centerA, "el centro pedido solo elige entre los propios");
  assert.ok(!ids.includes(fx.memberB));
});
