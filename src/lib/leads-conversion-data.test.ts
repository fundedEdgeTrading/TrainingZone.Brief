import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { createLead, initiateLeadConversion } from "@/lib/leads-queries";

/**
 * QA-ALTA-06 · RB-LEAD-007: al convertir, el lead se traslada al socio sin
 * recapturar. La conversión se dejaba por el camino la fecha de nacimiento,
 * los objetivos y el consentimiento comercial que el lead dio (y que consta en
 * `AuditLog`). Sin la fecha, además, la política de menores no se aplicaba.
 */

const SLUG = "qa-alta-06-conversion";
let orgId = "";
let centerId = "";
let seq = 0;

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({
    data: { name: "Conversión", slug: SLUG, platformStatus: "ACTIVE", allowsMinors: false },
  });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  const where = { orgId: org.id };
  await prisma.auditLog.deleteMany({ where });
  await prisma.clientGoal.deleteMany({ where });
  await prisma.memberNote.deleteMany({ where });
  await prisma.lead.deleteMany({ where });
  await prisma.invitation.deleteMany({ where });
  await prisma.member.deleteMany({ where });
  await prisma.center.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: org.id } });
}

function yearsAgo(years: number) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function lead(opts: { birthDate?: Date | null; goals?: string; marketingConsent?: boolean }) {
  seq += 1;
  const created = await createLead({
    orgId,
    centerId,
    firstName: `Lead${seq}`,
    lastName: "Conversión",
    phone: `60000070${seq}`,
    email: `lead${seq}@${SLUG}.test`,
    postalCode: "",
    occupation: "",
    goals: opts.goals ?? "",
    hasTrainedBefore: false,
    channel: "Instagram",
    birthDate: opts.birthDate ?? null,
    marketingConsent: opts.marketingConsent,
  });
  if (!created.ok) throw new Error(created.error);
  return created.leadId;
}

test("QA-ALTA-06 · la conversión traslada fecha de nacimiento, objetivos y consentimiento comercial", async () => {
  const birthDate = yearsAgo(30);
  const leadId = await lead({ birthDate, goals: "Perder 5 kg y dormir mejor", marketingConsent: true });

  const converted = await initiateLeadConversion(orgId, leadId, { closeType: "EMBUDO" });
  assert.equal(converted.ok, true);
  if (!converted.ok) return;

  const member = await prisma.member.findUniqueOrThrow({ where: { id: converted.memberId } });
  assert.equal(member.birthDate?.toISOString(), birthDate.toISOString());
  assert.equal(member.consentMarketing, true);
  assert.ok(member.consentMarketingAt, "con la fecha en que lo dio el lead");

  const goals = await prisma.clientGoal.findMany({ where: { memberId: member.id } });
  assert.deepEqual(goals.map((g) => g.label), ["Perder 5 kg y dormir mejor"]);

  // El consentimiento no se inventa: el socio lo hereda de una prueba concreta.
  const source = await prisma.auditLog.findFirstOrThrow({
    where: { orgId, action: "LEAD_MARKETING_CONSENT_RECORDED", entityType: "Lead", entityId: leadId },
  });
  const origin = await prisma.auditLog.findFirst({
    where: { orgId, action: "MEMBER_MARKETING_CONSENT_FROM_LEAD", entityType: "Member", entityId: member.id },
  });
  assert.ok(origin, "falta el AuditLog de origen del consentimiento");
  assert.equal((origin.metadata as { sourceAuditLogId?: string }).sourceAuditLogId, source.id);
  assert.equal(member.consentMarketingAt?.toISOString(), source.createdAt.toISOString());
});

test("QA-ALTA-06 · un «no» comercial del lead no se convierte en un sí", async () => {
  const leadId = await lead({ birthDate: yearsAgo(40), marketingConsent: false });
  const converted = await initiateLeadConversion(orgId, leadId, {});
  assert.equal(converted.ok, true);
  if (!converted.ok) return;
  const member = await prisma.member.findUniqueOrThrow({ where: { id: converted.memberId } });
  assert.equal(member.consentMarketing, false);
  assert.equal(member.consentMarketingAt, null);
  assert.equal(await prisma.clientGoal.count({ where: { memberId: member.id } }), 0, "sin objetivos no se crea uno vacío");
});

test("QA-ALTA-06 · con fecha de nacimiento se aplica la política de menores del centro", async () => {
  const leadId = await lead({ birthDate: yearsAgo(16) });
  const converted = await initiateLeadConversion(orgId, leadId, {});
  assert.equal(converted.ok, false);
  if (converted.ok) return;
  assert.match(converted.error, /mayores de 18/);
  const stored = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  assert.equal(stored.convertedMemberId, null, "no nace ningún socio");
});
