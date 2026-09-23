import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSetupChecklist } from "@/lib/setup-checklist";

/**
 * QA-ALTA-16 · «Tu equipo» contaba cualquier `User` que no fuera OWNER: el
 * primer socio que activaba su acceso (rol MEMBER) o un empleado ya dado de
 * baja daban el paso por hecho sin que hubiera nadie invitado.
 */

const SLUG = "qa-alta-16-equipo";
let orgId = "";

before(async () => {
  await cleanup();
  orgId = (await prisma.organization.create({ data: { name: "Equipo", slug: SLUG, platformStatus: "ACTIVE" } })).id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (org) {
    await prisma.user.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
  await prisma.identity.deleteMany({ where: { email: { endsWith: `@${SLUG}.test` } } });
}

async function addUser(tag: string, role: Role, deactivated = false) {
  const identity = await prisma.identity.create({ data: { email: `${tag}@${SLUG}.test`, passwordHash: "x" } });
  await prisma.user.create({
    data: { identityId: identity.id, orgId, name: tag, email: identity.email, role, deactivatedAt: deactivated ? new Date() : null },
  });
}

async function teamDone() {
  return (await getSetupChecklist(orgId)).find((s) => s.id === "equipo")?.done;
}

test("QA-ALTA-16 · ni el director, ni los socios, ni las bajas cuentan como equipo", async () => {
  await addUser("director", "OWNER");
  await addUser("socia", "MEMBER");
  await addUser("baja", "TRAINER", true);
  assert.equal(await teamDone(), false);
});

test("QA-ALTA-16 · un miembro del personal en activo sí", async () => {
  await addUser("recepcion", "RECEPTION");
  assert.equal(await teamDone(), true);
});
