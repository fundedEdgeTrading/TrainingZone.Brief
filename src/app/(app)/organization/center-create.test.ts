import "dotenv/config";
import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createCenterWithinLimit } from "./center-create";

/**
 * QA-ALTA-18 · El límite de centros del plan (RB-PLAN-002) aguanta altas
 * simultáneas. Antes se contaba y se insertaba en dos pasos sueltos: varias
 * altas a la vez leían "te queda uno" y entraban todas.
 */

const SLUG = "qa-alta-18-centros";
let orgId: string;

async function wipe() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  await prisma.center.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

const input = (n: number) => ({ name: `Centro ${n}`, slug: `centro-${n}`, address: null, lat: null, lng: null, logoUrl: null });

before(async () => {
  await wipe();
  // Esencial: un único centro.
  orgId = (
    await prisma.organization.create({
      data: { name: "Gimnasio", slug: SLUG, platformPlan: "esencial_mes", platformStatus: "ACTIVE" },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.center.deleteMany({ where: { orgId } });
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("QA-ALTA-18 · ocho altas simultáneas con hueco para una: entra exactamente una", async () => {
  // Pool caliente: con conexiones por abrir, la primera alta confirma antes de
  // que las demás lleguen a contar y la carrera no se ve. Con él, la versión
  // anterior (contar y luego insertar) dejaba entrar los ocho centros.
  await Promise.all(Array.from({ length: 10 }, () => prisma.$queryRaw`SELECT 1 AS x FROM pg_sleep(0.05)`));
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => createCenterWithinLimit(orgId, input(i))));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(await prisma.center.count({ where: { orgId } }), 1);
  const rejected = results.find((r) => !r.ok);
  assert.match(rejected && !rejected.ok ? rejected.error : "", /incluye 1 centro/);
});

test("QA-ALTA-18 · con hueco, el alta entra; sin él, se explica la salida", async () => {
  const first = await createCenterWithinLimit(orgId, input(1));
  assert.equal(first.ok, true);
  const second = await createCenterWithinLimit(orgId, input(2));
  assert.equal(second.ok, false);
  assert.match(!second.ok ? second.error : "", /Tu plan Esencial incluye 1 centro/);
});
