import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { getSetupChecklist } from "@/lib/setup-checklist";

/**
 * QA-ALTA-02 · La puesta en marcha no decía nada de los canales de captación,
 * y sin al menos uno activo el formulario público de leads no se puede enviar.
 */

const SLUG = "qa-alta-02-checklist";
let orgId = "";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Checklist canales", slug: SLUG, platformStatus: "ACTIVE" } });
  orgId = org.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  await prisma.leadChannel.deleteMany({ where: { orgId: org.id } });
  await prisma.organization.deleteMany({ where: { id: org.id } });
}

test("QA-ALTA-02 · hay un paso «Canales de captación» que depende de tener un canal activo", async () => {
  const empty = await getSetupChecklist(orgId);
  const step = empty.find((s) => s.id === "canales");
  assert.ok(step, "falta el paso de canales de captación");
  assert.equal(step.label, "Canales de captación");
  assert.equal(step.done, false);
  assert.equal(step.href, "/leads");

  await prisma.leadChannel.create({ data: { orgId, label: "Desactivado", active: false } });
  assert.equal((await getSetupChecklist(orgId)).find((s) => s.id === "canales")?.done, false);

  await prisma.leadChannel.create({ data: { orgId, label: "Instagram" } });
  assert.equal((await getSetupChecklist(orgId)).find((s) => s.id === "canales")?.done, true);
});
