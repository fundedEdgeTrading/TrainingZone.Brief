import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { prisma } from "@/lib/prisma";
import { ensureInitialAssessment } from "./member-first-session-queries";

/**
 * QA-ALTA-14 · Una sola valoración INITIAL por socio, aunque la abran a la vez
 * varios caminos (el onboarding, un reintento del cliente, el cron). El esquema
 * está congelado y no hay índice único que lo impida: lo impide el cerrojo por
 * socio de `ensureInitialAssessment`.
 *
 * Cada llamada concurrente usa su PROPIO cliente (su propio pool), que es lo
 * que pasa en producción: el onboarding y el cron corren en peticiones o
 * procesos distintos. Con un único cliente las consultas acaban en fila en la
 * misma conexión y la carrera no se reproduce.
 */

const SLUG = "p8-initial-assessment-lock";
let orgId = "";
let centerId = "";
let memberId = "";
const clients = Array.from(
  { length: 4 },
  () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
);

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.assessment.deleteMany({ where: { orgId: org.id } });
  await prisma.member.deleteMany({ where: { orgId: org.id } });
  await prisma.center.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
}

before(async () => {
  await cleanup();
  orgId = (await prisma.organization.create({ data: { name: "Cerrojo INITIAL", slug: SLUG } })).id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-c` } })).id;
});

beforeEach(async () => {
  await prisma.assessment.deleteMany({ where: { orgId } });
  await prisma.member.deleteMany({ where: { orgId } });
  memberId = (
    await prisma.member.create({
      data: { orgId, primaryCenterId: centerId, firstName: "Pablo", lastName: "Socio", email: `${SLUG}@example.com` },
    })
  ).id;
});

after(async () => {
  await cleanup();
  await Promise.all(clients.map((c) => c.$disconnect()));
  await prisma.$disconnect();
});

test("QA-ALTA-14 · varias llamadas simultáneas abren UNA sola valoración inicial", async () => {
  const joinedAt = new Date();
  // Conexiones abiertas antes de la carrera, para que la primera no gane por llegar antes.
  await Promise.all(clients.map((c) => c.$queryRaw`SELECT 1`));
  const ids = await Promise.all(clients.map((c) => ensureInitialAssessment(orgId, memberId, joinedAt, c)));

  assert.equal(await prisma.assessment.count({ where: { orgId, memberId, kind: "INITIAL" } }), 1);
  assert.equal(new Set(ids).size, 1, "todas devuelven la misma");
});

test("QA-ALTA-14 · si ya hay una inicial (abierta o cerrada) se reutiliza", async () => {
  const existing = await prisma.assessment.create({
    data: { orgId, memberId, kind: "INITIAL", dueDate: new Date(), answers: {}, completedAt: new Date() },
  });
  assert.equal(await ensureInitialAssessment(orgId, memberId, new Date()), existing.id);
  assert.equal(await prisma.assessment.count({ where: { orgId, memberId, kind: "INITIAL" } }), 1);
});
