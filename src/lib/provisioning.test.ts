import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_LEAD_CHANNELS,
  DEFAULT_NO_CLOSE_REASONS,
  ensureDefaultLeadCatalogs,
  provisionDemoOrganization,
} from "@/lib/provisioning";

/**
 * QA-ALTA-02 · Una organización recién pagada no tenía ni un `LeadChannel` ni
 * un `NoCloseReason`: solo los creaba `prisma/seed.ts`. El formulario público
 * enseñaba un select obligatorio vacío y `createLead` exige canal, así que el
 * embudo comercial nacía roto hasta que dirección descubriera el panel.
 */

const EMAIL_PREFIX = "qa-alta-02-";
const createdOrgIds: string[] = [];

after(async () => {
  for (const orgId of createdOrgIds) {
    await prisma.leadChannel.deleteMany({ where: { orgId } });
    await prisma.noCloseReason.deleteMany({ where: { orgId } });
    await prisma.invitation.deleteMany({ where: { orgId } });
    await prisma.auditLog.deleteMany({ where: { orgId } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  }
  await prisma.identity.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  await prisma.$disconnect();
});

async function provision(tag: string) {
  const result = await provisionDemoOrganization({
    planCode: "esencial_mes",
    email: `${EMAIL_PREFIX}${tag}-${Date.now()}@example.com`,
    name: `QA ALTA 02 ${tag} ${Date.now()}`,
  });
  if (!result.ok) throw new Error(result.error);
  createdOrgIds.push(result.orgId);
  return result.orgId;
}

test("QA-ALTA-02 · el alta por pago crea los canales de captación por defecto", async () => {
  const orgId = await provision("canales");
  const channels = await prisma.leadChannel.findMany({ where: { orgId, active: true }, select: { label: true } });
  const expected = ["Instagram", "Facebook", "Google", "Web", "Referido", "Paso por el centro", "Teléfono", "Otro"];
  assert.deepEqual(channels.map((c) => c.label).sort(), [...expected].sort());
});

test("QA-ALTA-02 · el alta por pago crea los motivos de no cierre por defecto", async () => {
  const orgId = await provision("motivos");
  const reasons = await prisma.noCloseReason.findMany({ where: { orgId, active: true }, select: { label: true } });
  const expected = ["Precio", "Horario", "Distancia", "Se va a otro centro", "No responde", "Otro"];
  assert.deepEqual(reasons.map((r) => r.label).sort(), [...expected].sort());
});

test("QA-ALTA-02 · sembrar los catálogos es idempotente y respeta lo que ya hay", async () => {
  const orgId = await provision("idempotente");
  // Dirección desactiva un canal y crea uno propio escrito a su manera: volver
  // a sembrar no puede resucitar el desactivado ni duplicar el que ya existe.
  await prisma.leadChannel.updateMany({ where: { orgId, label: "Facebook" }, data: { active: false } });
  await prisma.leadChannel.deleteMany({ where: { orgId, label: "Instagram" } });
  await prisma.leadChannel.create({ data: { orgId, label: "instagram" } });

  await prisma.$transaction((tx) => ensureDefaultLeadCatalogs(tx, orgId));
  await prisma.$transaction((tx) => ensureDefaultLeadCatalogs(tx, orgId));

  const channels = await prisma.leadChannel.findMany({ where: { orgId }, select: { label: true, active: true } });
  assert.equal(channels.length, DEFAULT_LEAD_CHANNELS.length);
  assert.equal(channels.find((c) => c.label === "Facebook")?.active, false);
  assert.equal(channels.filter((c) => c.label.toLowerCase() === "instagram").length, 1);
  assert.equal(await prisma.noCloseReason.count({ where: { orgId } }), DEFAULT_NO_CLOSE_REASONS.length);
});
