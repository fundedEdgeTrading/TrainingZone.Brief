import "dotenv/config";
import test, { after, before, mock } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { sendMemberWelcome } from "@/lib/member-welcome";

/** QA-ALTA-04 · la pieza compartida de bienvenida: qué token manda y cuándo no manda nada. */

const SLUG = "qa-alta-04-member-welcome";
let orgId = "";
let centerId = "";
const sent: { to: string; html: string }[] = [];
const previousKey = process.env.BREVO_API_KEY;

before(async () => {
  await cleanup();
  process.env.BREVO_API_KEY = "test-key";
  mock.method(globalThis, "fetch", async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { to: { email: string }[]; htmlContent: string };
    sent.push({ to: body.to[0]!.email, html: body.htmlContent });
    return new Response("{}", { status: 201 });
  });
  const org = await prisma.organization.create({ data: { name: "Bienvenidas", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;
});

after(async () => {
  mock.restoreAll();
  if (previousKey === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = previousKey;
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.invitation.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.deleteMany({ where: { id: org.id } });
}

async function newMember(tag: string) {
  return prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: tag, lastName: "Test", email: `${tag}@${SLUG}.test`, state: "TRIAL" },
  });
}

test("sin invitación, crea una y manda su enlace", async () => {
  const member = await newMember("sin-invitacion");
  const result = await sendMemberWelcome(member.id);
  assert.equal(result.ok, true);
  const invitation = await prisma.invitation.findUniqueOrThrow({ where: { memberId: member.id } });
  const mail = sent.find((m) => m.to === member.email);
  assert.ok(mail?.html.includes(invitation.token));
});

test("con invitación abierta, reutiliza su token; caducada, emite otro", async () => {
  const member = await newMember("abierta");
  await prisma.invitation.create({
    data: { orgId, type: "MEMBER", token: `${SLUG}-abierta`, email: member.email, memberId: member.id, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  await sendMemberWelcome(member.id);
  assert.ok(sent.at(-1)?.html.includes(`${SLUG}-abierta`));

  await prisma.invitation.update({ where: { memberId: member.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await sendMemberWelcome(member.id);
  const renewed = await prisma.invitation.findUniqueOrThrow({ where: { memberId: member.id } });
  assert.notEqual(renewed.token, `${SLUG}-abierta`);
  assert.ok(renewed.expiresAt > new Date());
  assert.ok(sent.at(-1)?.html.includes(renewed.token));
});

test("un socio que ya activó su acceso, o que no existe, no recibe nada", async () => {
  const before = sent.length;
  assert.equal((await sendMemberWelcome("no-existe")).ok, false);
  const member = await newMember("activo");
  const identity = await prisma.identity.create({ data: { email: `activo-id@${SLUG}.test`, passwordHash: "x" } });
  const user = await prisma.user.create({
    data: { identityId: identity.id, orgId, name: "Activo", email: identity.email, role: "MEMBER" },
  });
  await prisma.member.update({ where: { id: member.id }, data: { userId: user.id } });
  assert.equal((await sendMemberWelcome(member.id)).ok, false);
  assert.equal(sent.length, before);
  await prisma.member.update({ where: { id: member.id }, data: { userId: null } });
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.identity.delete({ where: { id: identity.id } });
});
