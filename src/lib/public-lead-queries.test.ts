import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
// Se prueba la action entera, no solo la validación: es la frontera pública.
// (El test vive aquí y no junto a la action porque `node --test` interpreta los
// corchetes de `[orgSlug]` como un patrón glob y no lo encontraría.)
import { submitPublicLead } from "@/app/lead-form/[orgSlug]/[centerSlug]/actions";

/**
 * QA-ALTA-20 · El formulario público es una server action sin sesión: todo lo
 * que llega en el FormData es del visitante. Se creía el canal (cualquier
 * texto, aunque estuviera desactivado o fuera de otra organización), el sexo
 * (un valor fuera del enum reventaba en Prisma con un 500) y aceptaba leads de
 * organizaciones suspendidas o canceladas.
 */

const SLUG = "qa-alta-20-form";
let orgId = "";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Formulario", slug: SLUG, platformStatus: "ACTIVE" } });
  orgId = org.id;
  await prisma.center.create({ data: { orgId, name: "Centro", slug: "centro" } });
  await prisma.leadChannel.createMany({
    data: [
      { orgId, label: "Instagram" },
      { orgId, label: "Desactivado", active: false },
    ],
  });
  const other = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra`, platformStatus: "ACTIVE" } });
  await prisma.leadChannel.create({ data: { orgId: other.id, label: "Solo de la otra" } });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (!ids.length) return;
  await prisma.auditLog.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.leadChannel.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.center.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

let seq = 0;
function form(overrides: Record<string, string> = {}) {
  seq += 1;
  const fd = new FormData();
  const fields: Record<string, string> = {
    firstName: "Eva",
    lastName: "Pública",
    phone: `60000090${seq}`,
    postalCode: "50001",
    occupation: "Docente",
    goals: "Fuerza",
    channel: "Instagram",
    birthDate: "1990-05-05",
    ...overrides,
  };
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function leadCount() {
  return prisma.lead.count({ where: { orgId } });
}

test("QA-ALTA-20 · un canal activo de la organización se acepta", async () => {
  const result = await submitPublicLead(SLUG, "centro", form({ sex: "FEMALE" }));
  assert.equal(result.ok, true);
});

test("QA-ALTA-20 · un canal inventado, desactivado o de otra organización se rechaza", async () => {
  const before = await leadCount();
  for (const channel of ["Canal inventado", "Desactivado", "Solo de la otra"]) {
    const result = await submitPublicLead(SLUG, "centro", form({ channel }));
    assert.equal(result.ok, false, `debería rechazar «${channel}»`);
  }
  assert.equal(await leadCount(), before);
});

test("QA-ALTA-20 · un sexo fuera de la lista se rechaza con un mensaje, no con un 500", async () => {
  const before = await leadCount();
  const result = await submitPublicLead(SLUG, "centro", form({ sex: "ALIEN" }));
  assert.equal(result.ok, false);
  assert.equal(await leadCount(), before);
  // "Prefiero no decirlo" sigue siendo válido.
  assert.equal((await submitPublicLead(SLUG, "centro", form({ sex: "" }))).ok, true);
});

test("QA-ALTA-20 · una organización que no está operativa no recibe leads", async () => {
  for (const status of ["SUSPENDED", "CANCELLED", "PENDING_PAYMENT"] as const) {
    await prisma.organization.update({ where: { id: orgId }, data: { platformStatus: status } });
    const before = await leadCount();
    const result = await submitPublicLead(SLUG, "centro", form());
    assert.equal(result.ok, false, `${status} no debería recibir leads`);
    assert.equal(await leadCount(), before);
  }
  await prisma.organization.update({ where: { id: orgId }, data: { platformStatus: "ACTIVE" } });
});
