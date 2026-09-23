import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assignLeadOwner, createLead, parseLeadCloseType } from "@/lib/leads-queries";

/**
 * QA-ALTA-19 · Dos entradas que el servidor se creía tal cual:
 * - `assignLeadOwner` aceptaba cualquier `userId`: un socio, el personal de
 *   otra organización o alguien dado de baja podían quedar de responsables.
 * - `convertLeadAction` hacía un cast de `closeType` sin validar.
 */

const SLUG = "qa-alta-19-responsable";
let orgId = "";
let otherOrgId = "";
let centerA = "";
let centerB = "";
let leadId = "";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Responsable", slug: SLUG, platformStatus: "ACTIVE" } });
  orgId = org.id;
  const other = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra`, platformStatus: "ACTIVE" } });
  otherOrgId = other.id;
  centerA = (await prisma.center.create({ data: { orgId, name: "A", slug: `${SLUG}-a` } })).id;
  centerB = (await prisma.center.create({ data: { orgId, name: "B", slug: `${SLUG}-b` } })).id;
  const created = await createLead({
    orgId,
    centerId: centerA,
    firstName: "Dani",
    lastName: "Sinresponsable",
    phone: "600000801",
    postalCode: "",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: "Web",
  });
  if (!created.ok) throw new Error(created.error);
  leadId = created.leadId;
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
  await prisma.notification.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.user.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.identity.deleteMany({ where: { email: { endsWith: `@${SLUG}.test` } } });
  await prisma.center.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
}

async function user(tag: string, role: Role, opts: { org?: string; centerId?: string | null; deactivated?: boolean } = {}) {
  const identity = await prisma.identity.create({ data: { email: `${tag}@${SLUG}.test`, passwordHash: "x" } });
  const created = await prisma.user.create({
    data: {
      identityId: identity.id,
      orgId: opts.org ?? orgId,
      centerId: opts.centerId === undefined ? centerA : opts.centerId,
      name: tag,
      email: identity.email,
      role,
      deactivatedAt: opts.deactivated ? new Date() : null,
    },
  });
  return created.id;
}

async function ownerOfLead() {
  return (await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { ownerUserId: true } })).ownerUserId;
}

test("QA-ALTA-19 · un socio no puede ser responsable de un lead", async () => {
  const member = await user("socio", "MEMBER");
  assert.equal((await assignLeadOwner(orgId, leadId, member)).ok, false);
  assert.equal(await ownerOfLead(), null);
});

test("QA-ALTA-19 · ni el personal de otra organización, ni alguien de baja, ni un id inventado", async () => {
  const foreign = await user("ajeno", "RECEPTION", { org: otherOrgId, centerId: null });
  const gone = await user("baja", "RECEPTION", { deactivated: true });
  for (const candidate of [foreign, gone, "no-existe"]) {
    assert.equal((await assignLeadOwner(orgId, leadId, candidate)).ok, false);
  }
  assert.equal(await ownerOfLead(), null);
});

test("QA-ALTA-19 · el responsable tiene que poder ver el centro del lead", async () => {
  const otherCenter = await user("entrenador-b", "TRAINER", { centerId: centerB });
  assert.equal((await assignLeadOwner(orgId, leadId, otherCenter)).ok, false);

  const sameCenter = await user("entrenador-a", "TRAINER", { centerId: centerA });
  assert.equal((await assignLeadOwner(orgId, leadId, sameCenter)).ok, true);
  assert.equal(await ownerOfLead(), sameCenter);

  // Dirección de organización ve todos los centros.
  const owner = await user("direccion", "OWNER", { centerId: null });
  assert.equal((await assignLeadOwner(orgId, leadId, owner)).ok, true);
});

test("QA-ALTA-19 · closeType se valida: vacío es EMBUDO y un valor desconocido se rechaza", () => {
  assert.deepEqual(parseLeadCloseType(null), { ok: true, closeType: "EMBUDO" });
  assert.deepEqual(parseLeadCloseType(""), { ok: true, closeType: "EMBUDO" });
  assert.deepEqual(parseLeadCloseType("ONLINE"), { ok: true, closeType: "ONLINE" });
  assert.deepEqual(parseLeadCloseType("DIRECTO"), { ok: true, closeType: "DIRECTO" });
  assert.equal(parseLeadCloseType("CERRADO").ok, false);
  assert.equal(parseLeadCloseType("online").ok, false);
});
