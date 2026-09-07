import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { listMembers } from "@/lib/members-queries";

/**
 * E12-10 · `members-queries.ts:32` tenía `take: 300` fijo: un centro con 320
 * socios perdía 20 filas sin ningún aviso. Sin `take` explícito, `listMembers`
 * ya no trunca — la paginación real vive en `/members` (page.tsx), que decide
 * cuántas de esas filas pinta en cada página.
 */

const SLUG = "e12-10-members-paginacion";
const TOTAL_MEMBERS = 305;
let orgId: string;
let centerId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Paginación", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;

  await prisma.member.createMany({
    data: Array.from({ length: TOTAL_MEMBERS }, (_, i) => ({
      orgId,
      primaryCenterId: centerId,
      firstName: "Socio",
      lastName: String(i).padStart(4, "0"),
      email: `${SLUG}-${i}@example.com`,
      state: "ACTIVE" as const,
    })),
  });
});

after(async () => {
  if (!orgId) return;
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.center.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E12-10 · sin take explícito, listMembers devuelve TODAS las filas del ámbito", async () => {
  const members = await listMembers(orgId, { centerIds: [centerId] });
  assert.equal(members.length, TOTAL_MEMBERS, `un centro de ${TOTAL_MEMBERS} socios no puede perder filas en silencio`);
});

test("E12-10 · con take explícito (scroll infinito de la app), sigue paginando de verdad", async () => {
  const firstPage = await listMembers(orgId, { centerIds: [centerId], take: 30 });
  assert.equal(firstPage.length, 30);
});
