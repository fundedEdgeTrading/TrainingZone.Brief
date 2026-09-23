import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-auth";
import { POST } from "./route";

/**
 * Alta de personal desde la app nativa (`POST /api/mobile/v1/staff`).
 *
 * QA-ALTA-01: la app aceptaba `role: "PLATFORM_ADMIN"` de un OWNER — el mismo
 * agujero que la web, en su espejo.
 */

const SLUG = "qa-alta-mobile-staff";
const PLATFORM_SLUG = `${SLUG}-apta`;
let orgId: string;
let centerId: string;
let ownerId: string;
let platformOrgId: string;
let platformAdminId: string;
let originalEnv: string | undefined;

async function wipe() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  await prisma.centerMembership.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.invitation.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.user.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.center.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
}

async function staffUser(org: string, role: Role, tag: string) {
  const email = `${tag}@${SLUG}.example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
  return prisma.user.create({ data: { identityId: identity.id, orgId: org, name: tag, email, role } });
}

before(async () => {
  originalEnv = process.env.PLATFORM_ORG_SLUG;
  process.env.PLATFORM_ORG_SLUG = PLATFORM_SLUG;
  await wipe();
  orgId = (await prisma.organization.create({ data: { name: "Gimnasio", slug: `${SLUG}-cliente`, platformStatus: "ACTIVE" } })).id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro", slug: "centro" } })).id;
  ownerId = (await staffUser(orgId, "OWNER", "owner")).id;
  platformOrgId = (await prisma.organization.create({ data: { name: "Apta", slug: PLATFORM_SLUG, platformStatus: "ACTIVE" } })).id;
  platformAdminId = (await staffUser(platformOrgId, "PLATFORM_ADMIN", "soporte")).id;
});

after(async () => {
  if (originalEnv === undefined) delete process.env.PLATFORM_ORG_SLUG;
  else process.env.PLATFORM_ORG_SLUG = originalEnv;
  await wipe();
  await prisma.$disconnect();
});

async function post(actor: { sub: string; role: Role; orgId: string; centerId: string | null }, body: unknown) {
  const token = await signAccessToken(actor);
  return POST(
    new NextRequest("http://localhost/api/mobile/v1/staff", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

test("QA-ALTA-01 · un OWNER no puede crear un PLATFORM_ADMIN desde la app", async () => {
  const email = `escalada@${SLUG}.example.com`;
  const res = await post(
    { sub: ownerId, role: "OWNER", orgId, centerId: null },
    { name: "Escalada", email, role: "PLATFORM_ADMIN" }
  );
  assert.equal(res.status, 403);
  assert.equal(await prisma.user.count({ where: { orgId, email } }), 0);
});

test("QA-ALTA-01 · soporte de Apta sí puede crear otro PLATFORM_ADMIN en la organización de plataforma", async () => {
  const email = `soporte2@${SLUG}.example.com`;
  const res = await post(
    { sub: platformAdminId, role: "PLATFORM_ADMIN", orgId: platformOrgId, centerId: null },
    { name: "Soporte 2", email, role: "PLATFORM_ADMIN" }
  );
  assert.equal(res.status, 201);
  const created = await prisma.user.findFirst({ where: { orgId: platformOrgId, email }, select: { role: true } });
  assert.equal(created?.role, "PLATFORM_ADMIN");
});

test("un OWNER sigue dando de alta roles de centro, con su imputación primaria", async () => {
  const email = `entrenador@${SLUG}.example.com`;
  const res = await post(
    { sub: ownerId, role: "OWNER", orgId, centerId: null },
    { name: "Entrenador", email, role: "TRAINER", centerId }
  );
  assert.equal(res.status, 201);
  const user = await prisma.user.findFirst({ where: { orgId, email }, select: { id: true } });
  const membership = await prisma.centerMembership.findFirst({ where: { userId: user!.id, centerId } });
  assert.equal(membership?.isPrimary, true);
});
