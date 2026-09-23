import "dotenv/config";
import test, { after, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { isPlatformOperator, isPlatformOrgSlug } from "./platform-access";

/**
 * QA-ALTA-01 (c) · Puerta de `/apta` (página y acciones). El rol
 * `PLATFORM_ADMIN` lo podía escribir un OWNER en su propia plantilla; con él
 * veía todas las organizaciones y creaba otras en ACTIVE sin pagar. Hace falta
 * además ser de la organización de la plataforma (`PLATFORM_ORG_SLUG`).
 */

const SLUG = "qa-alta-01-platform";
const PLATFORM_SLUG = `${SLUG}-apta`;
let platformOrgId: string;
let customerOrgId: string;
let originalEnv: string | undefined;

before(async () => {
  originalEnv = process.env.PLATFORM_ORG_SLUG;
  await prisma.organization.deleteMany({ where: { slug: { startsWith: SLUG } } });
  platformOrgId = (await prisma.organization.create({ data: { name: "Apta", slug: PLATFORM_SLUG } })).id;
  customerOrgId = (await prisma.organization.create({ data: { name: "Gimnasio", slug: `${SLUG}-cliente` } })).id;
});

afterEach(() => {
  process.env.PLATFORM_ORG_SLUG = PLATFORM_SLUG;
});

after(async () => {
  if (originalEnv === undefined) delete process.env.PLATFORM_ORG_SLUG;
  else process.env.PLATFORM_ORG_SLUG = originalEnv;
  await prisma.organization.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.$disconnect();
});

test("QA-ALTA-01 · un PLATFORM_ADMIN de una organización cliente NO entra en /apta", async () => {
  process.env.PLATFORM_ORG_SLUG = PLATFORM_SLUG;
  assert.equal(await isPlatformOperator({ role: "PLATFORM_ADMIN", orgId: customerOrgId }), false);
});

test("QA-ALTA-01 · un OWNER de la organización de plataforma tampoco: hace falta el rol", async () => {
  process.env.PLATFORM_ORG_SLUG = PLATFORM_SLUG;
  assert.equal(await isPlatformOperator({ role: "OWNER", orgId: platformOrgId }), false);
});

test("QA-ALTA-01 · PLATFORM_ADMIN de la organización de plataforma sí entra", async () => {
  process.env.PLATFORM_ORG_SLUG = PLATFORM_SLUG;
  assert.equal(await isPlatformOperator({ role: "PLATFORM_ADMIN", orgId: platformOrgId }), true);
});

test("QA-ALTA-01 · sin PLATFORM_ORG_SLUG no entra nadie (falla cerrado)", async () => {
  delete process.env.PLATFORM_ORG_SLUG;
  assert.equal(await isPlatformOperator({ role: "PLATFORM_ADMIN", orgId: platformOrgId }), false);
  process.env.PLATFORM_ORG_SLUG = "   ";
  assert.equal(await isPlatformOperator({ role: "PLATFORM_ADMIN", orgId: platformOrgId }), false);
});

test("isPlatformOrgSlug compara exacto y nunca casa con un slug vacío", () => {
  const env = { PLATFORM_ORG_SLUG: "apta" };
  assert.equal(isPlatformOrgSlug("apta", env), true);
  assert.equal(isPlatformOrgSlug("apta-falsa", env), false);
  assert.equal(isPlatformOrgSlug(null, env), false);
  assert.equal(isPlatformOrgSlug("", {}), false);
});
