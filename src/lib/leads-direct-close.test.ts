import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { createLead, type CreateLeadInput } from "@/lib/leads-queries";

/**
 * QA-ALTA-03 · "Cerrado directamente" en recepción.
 *
 * 1. Llamaba a `confirmLeadClosureForMember` sin que existiera ningún pago:
 *    el lead pasaba a CERRADO, el socio a ACTIVE y, si venía de un referido, se
 *    liberaba la recompensa del embajador. RB-LEAD-005 dice que eso solo pasa
 *    cuando se confirma el cobro.
 * 2. El email duplicado se descubría DESPUÉS de `lead.create`: cada reintento
 *    del formulario dejaba un lead huérfano más.
 */

const SLUG = "qa-alta-03-cierre-directo";
let orgId = "";
let centerId = "";
let referrerId = "";
let codeId = "";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({ data: { name: "Cierre directo", slug: SLUG, platformStatus: "ACTIVE" } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;

  const referrer = await prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: "Ana", lastName: "Embajadora", email: `ana@${SLUG}.test`, state: "ACTIVE" },
  });
  referrerId = referrer.id;
  const code = await prisma.referralCode.create({ data: { orgId, centerId, memberId: referrerId, code: "QA-ALTA-03" } });
  codeId = code.id;
  await prisma.referralProgramConfig.create({
    data: {
      orgId,
      centerId,
      active: true,
      referrerKind: "FIXED_AMOUNT",
      referrerAmountCents: 2000,
      referredKind: "FREE_SESSIONS",
      referredSessions: 1,
      exMemberCooldownDays: 180,
    },
  });
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function cleanup() {
  const org = await prisma.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!org) return;
  const where = { orgId: org.id };
  await prisma.notification.deleteMany({ where });
  await prisma.referralReward.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.memberNote.deleteMany({ where });
  await prisma.leadNote.deleteMany({ where });
  await prisma.lead.deleteMany({ where });
  await prisma.invitation.deleteMany({ where });
  await prisma.referralCode.deleteMany({ where });
  await prisma.referralProgramConfig.deleteMany({ where });
  await prisma.member.deleteMany({ where });
  await prisma.center.deleteMany({ where });
  await prisma.organization.deleteMany({ where: { id: org.id } });
}

function directCloseInput(overrides: Partial<CreateLeadInput>): CreateLeadInput {
  return {
    orgId,
    centerId,
    firstName: "Bea",
    lastName: "Directa",
    phone: "600000301",
    email: `bea@${SLUG}.test`,
    postalCode: "",
    occupation: "",
    goals: "",
    hasTrainedBefore: false,
    channel: "Referido",
    directClose: { planId: null },
    ...overrides,
  };
}

test("QA-ALTA-03 · «Cerrado directamente» sin pago deja el lead en conversión y no libera la recompensa", async () => {
  const result = await createLead(directCloseInput({ referredByMemberId: referrerId, referralCodeId: codeId }));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId } });
  assert.ok(lead.convertedMemberId, "el alta se inicia: hay socio en curso");
  assert.notEqual(lead.status, "CERRADO", "RB-LEAD-005: sin pago confirmado no hay CERRADO");
  assert.equal(lead.closeType, "DIRECTO");

  const member = await prisma.member.findUniqueOrThrow({ where: { id: lead.convertedMemberId! } });
  assert.equal(member.state, "TRIAL", "el socio no se activa sin cobro");
  assert.equal(await prisma.referralReward.count({ where: { orgId } }), 0, "la recompensa espera al pago");
});

test("QA-ALTA-03 · un email que ya es de un socio se rechaza ANTES de crear el lead", async () => {
  const before = await prisma.lead.count({ where: { orgId } });
  // Dos reintentos con el email del socio embajador: ninguno debe dejar rastro.
  for (let i = 0; i < 2; i++) {
    const result = await createLead(directCloseInput({ phone: `60000040${i}`, email: `ANA@${SLUG}.test` }));
    assert.equal(result.ok, false);
  }
  assert.equal(await prisma.lead.count({ where: { orgId } }), before, "ningún lead huérfano");
});

test("QA-ALTA-03 · sin email tampoco se crea el lead de un cierre directo", async () => {
  const before = await prisma.lead.count({ where: { orgId } });
  const result = await createLead(directCloseInput({ phone: "600000500", email: null }));
  assert.equal(result.ok, false);
  assert.equal(await prisma.lead.count({ where: { orgId } }), before);
});
