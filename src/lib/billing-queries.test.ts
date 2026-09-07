import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { listPayments, countPayments } from "@/lib/billing-queries";

/**
 * E8-13 · /billing pagina y ordena en servidor. Antes `take: 100` era un
 * tope silencioso sin ningún control de orden.
 */

const SLUG = "e8-13-billing-test";
let orgId: string;
let centerId: string;
let memberId: string;

before(async () => {
  const org = await prisma.organization.create({ data: { name: "Billing", slug: SLUG } });
  orgId = org.id;
  const center = await prisma.center.create({ data: { orgId, name: "Centro", slug: `${SLUG}-centro` } });
  centerId = center.id;
  const member = await prisma.member.create({
    data: { orgId, primaryCenterId: centerId, firstName: "Ana", lastName: "Test", email: `${SLUG}@example.com` },
  });
  memberId = member.id;

  await prisma.payment.createMany({
    data: [10, 30, 20].map((euros, i) => ({
      orgId,
      memberId,
      amountCents: euros * 100,
      method: "CARD" as const,
      status: "PAID" as const,
      date: new Date(2026, 0, i + 1),
    })),
  });
});

after(async () => {
  if (!orgId) return;
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.member.deleteMany({ where: { orgId } });
  await prisma.center.deleteMany({ where: { orgId } });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.$disconnect();
});

test("E8-13 · countPayments cuenta el total real del ámbito", async () => {
  assert.equal(await countPayments(orgId, { centerIds: [centerId] }), 3);
});

test("E8-13 · listPayments ordena por importe en los dos sentidos", async () => {
  const asc = await listPayments(orgId, { centerIds: [centerId], sort: "amount_asc" });
  assert.deepEqual(asc.map((p) => p.amountCents), [1000, 2000, 3000]);

  const desc = await listPayments(orgId, { centerIds: [centerId], sort: "amount_desc" });
  assert.deepEqual(desc.map((p) => p.amountCents), [3000, 2000, 1000]);
});

test("E8-13 · listPayments pagina con skip/take", async () => {
  const firstPage = await listPayments(orgId, { centerIds: [centerId], sort: "amount_asc", skip: 0, take: 2 });
  assert.equal(firstPage.length, 2);
  const secondPage = await listPayments(orgId, { centerIds: [centerId], sort: "amount_asc", skip: 2, take: 2 });
  assert.equal(secondPage.length, 1);
});
