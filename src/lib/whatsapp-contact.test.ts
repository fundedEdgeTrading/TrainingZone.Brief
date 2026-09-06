import "dotenv/config";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { logWhatsappContactOpened } from "@/lib/whatsapp-contact";

/**
 * E12-17 · "queda registrado que se abrió el contacto, no el contenido de la
 * conversación" — la traza vive en AuditLog, con el motivo pero sin ningún
 * texto de mensaje.
 */

const SLUG = "e12-17-whatsapp-test";
let orgId: string;

after(async () => {
  if (!orgId) return;
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.identity.deleteMany({ where: { email: `${SLUG}@example.com` } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E12-17 · abrir WhatsApp deja traza en AuditLog, sin el contenido del mensaje", async () => {
  const org = await prisma.organization.create({ data: { name: "WhatsApp", slug: SLUG } });
  orgId = org.id;
  const identity = await prisma.identity.create({ data: { email: `${SLUG}@example.com`, passwordHash: "x" } });
  const actor = await prisma.user.create({
    data: { identityId: identity.id, orgId, name: "Recepción", email: identity.email, role: "RECEPTION" },
  });

  await logWhatsappContactOpened({
    orgId,
    actorUserId: actor.id,
    entityType: "Lead",
    entityId: "lead-id",
    reason: "lead_sin_responder",
  });

  const logs = await prisma.auditLog.findMany({ where: { orgId } });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, "WHATSAPP_CONTACT_OPENED");
  assert.equal(logs[0].entityType, "Lead");
  assert.deepEqual(logs[0].metadata, { reason: "lead_sin_responder" });
});
