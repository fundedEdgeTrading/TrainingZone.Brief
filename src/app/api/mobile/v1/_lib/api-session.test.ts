import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { assertPlatformOperational } from "./api-session";

/**
 * E12-08 · /me y notificaciones comprueban plataforma activa. `/me`,
 * `/notifications` y `/notifications/[id]/read` usaban `requireApiSession`
 * en vez de `requireApiRole`, así que una organización suspendida por impago
 * seguía sirviendo esas tres rutas desde la app.
 */

const SLUG = "e12-08-platform-test";
let orgId: string;

before(async () => {
  const org = await prisma.organization.create({
    data: { name: "Suspendida", slug: SLUG, platformPlan: "esencial_mes", platformStatus: "PAST_DUE" },
  });
  orgId = org.id;
});

after(async () => {
  if (!orgId) return;
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E12-08 · una organización suspendida bloquea con 402", async () => {
  const response = await assertPlatformOperational(orgId, "OWNER");
  assert.ok(response, "una organización PAST_DUE tiene que bloquear");
  assert.equal(response?.status, 402);
});

test("E12-08 · PLATFORM_ADMIN queda exento", async () => {
  const response = await assertPlatformOperational(orgId, "PLATFORM_ADMIN");
  assert.equal(response, null);
});

test("E12-08 · /me y las dos rutas de notificaciones ya no usan requireApiSession a secas", () => {
  const files = [
    "src/app/api/mobile/v1/me/route.ts",
    "src/app/api/mobile/v1/notifications/route.ts",
    "src/app/api/mobile/v1/notifications/[id]/read/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /requireApiActiveSession/, `${file} debería usar requireApiActiveSession`);
    assert.doesNotMatch(source, /\brequireApiSession\(/, `${file} ya no debería llamar a requireApiSession directamente`);
  }
});
