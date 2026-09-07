import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  freezeDaysUsedThisYear,
  getMemberFreezePolicyView,
  frozenDaysBetween,
  shiftedEndDate,
  FREEZE_ACTION,
  FREEZE_ENTITY,
} from "./freeze-view";

/**
 * E5-06 — escenario principal: los límites de congelación (días/año) se
 * calculan a partir de lo ya congelado este año, y el socio los ve ANTES de
 * pedirlo (`getMemberFreezePolicyView`).
 */

const SUFFIX = "e2e-freeze-view-test";

async function cleanup() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SUFFIX } }, select: { id: true } });
  for (const org of orgs) {
    await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
    await prisma.subscription.deleteMany({ where: { member: { orgId: org.id } } });
    await prisma.member.deleteMany({ where: { orgId: org.id } });
    await prisma.membershipPlan.deleteMany({ where: { orgId: org.id } });
    await prisma.center.deleteMany({ where: { orgId: org.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  }
}

before(cleanup);
after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function fixture(tag: string) {
  const slug = `${SUFFIX}-${tag}`;
  const org = await prisma.organization.create({ data: { name: `Freeze ${tag}`, slug } });
  const center = await prisma.center.create({ data: { orgId: org.id, name: "Centro", slug: `${slug}-centro` } });
  const plan = await prisma.membershipPlan.create({ data: { orgId: org.id, name: "Cuota", type: "MONTHLY", priceCents: 4900 } });
  const member = await prisma.member.create({
    data: { orgId: org.id, primaryCenterId: center.id, firstName: "Fran", lastName: tag, email: `${slug}@example.com` },
  });
  const subscription = await prisma.subscription.create({
    data: { memberId: member.id, planId: plan.id, centerId: center.id, startDate: new Date(), priceCents: 4900, status: "ACTIVE" },
  });
  return { orgId: org.id, memberId: member.id, subscriptionId: subscription.id };
}

test("sin congelaciones previas, el socio ve el límite completo disponible", async () => {
  const f = await fixture("sin-uso");
  const policy = await getMemberFreezePolicyView(f.subscriptionId);
  assert.equal(policy.usedDaysThisYear, 0);
  assert.equal(policy.remainingDays, policy.maxDaysPerYear);
});

test("una congelación ya pedida este año descuenta del límite anual", async () => {
  const f = await fixture("con-uso");
  const yearStart = new Date(new Date().getFullYear(), 5, 1);
  const yearEnd = new Date(new Date().getFullYear(), 5, 11); // 10 días
  await prisma.auditLog.create({
    data: {
      orgId: f.orgId,
      action: FREEZE_ACTION,
      entityType: FREEZE_ENTITY,
      entityId: f.subscriptionId,
      memberId: f.memberId,
      metadata: { startDate: yearStart, endDate: yearEnd },
    },
  });

  const used = await freezeDaysUsedThisYear(f.subscriptionId);
  assert.equal(used, 10);

  const policy = await getMemberFreezePolicyView(f.subscriptionId);
  assert.equal(policy.usedDaysThisYear, 10);
  assert.equal(policy.remainingDays, policy.maxDaysPerYear - 10);
});

test("reanudar desplaza la caducidad exactamente los días congelados", () => {
  const freezeStart = new Date("2026-09-01T00:00:00Z");
  const resumedAt = new Date("2026-09-11T00:00:00Z"); // 10 días después
  const frozenDays = frozenDaysBetween(freezeStart, resumedAt);
  assert.equal(frozenDays, 10);

  const originalEndDate = new Date("2026-09-30T00:00:00Z");
  const newEndDate = shiftedEndDate(originalEndDate, frozenDays);
  assert.equal(newEndDate?.toISOString(), "2026-10-10T00:00:00.000Z");
});

test("un bono sin caducidad (cuota) no gana una fecha de la nada al reanudar", () => {
  assert.equal(shiftedEndDate(null, 10), null);
});
