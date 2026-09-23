import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createStaffAccount } from "./staff-roles";

/**
 * QA-ALTA-11 · El alta de personal es todo o nada. La imputación primaria se
 * creaba después del commit: si fallaba, quedaba una persona de centro sin
 * centro y con el email ocupado, y repetir el alta daba "ya existe".
 */

const SLUG = "qa-alta-11-staff";
let orgId: string;
let centerId: string;

async function wipe() {
  const orgs = await prisma.organization.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  await prisma.centerMembership.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.invitation.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.user.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.center.deleteMany({ where: { orgId: { in: ids } } });
  await prisma.organization.deleteMany({ where: { id: { in: ids } } });
  await prisma.identity.deleteMany({ where: { email: { contains: SLUG } } });
}

before(async () => {
  await wipe();
  orgId = (await prisma.organization.create({ data: { name: "Gimnasio", slug: SLUG } })).id;
  centerId = (await prisma.center.create({ data: { orgId, name: "Centro", slug: "centro" } })).id;
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

/** Transacción cuya escritura de imputación revienta, como lo haría un corte de conexión. */
function failingMembership(tx: Prisma.TransactionClient): Prisma.TransactionClient {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === "centerMembership") {
        return { create: () => Promise.reject(new Error("fallo simulado de la imputación")) };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

test("QA-ALTA-11 · si la imputación falla, no queda ni la persona ni su invitación", async () => {
  const email = `rollback@${SLUG}.example.com`;
  await assert.rejects(
    prisma.$transaction((tx) =>
      createStaffAccount(failingMembership(tx), { orgId, name: "Rollback", email, role: "TRAINER", centerId })
    ),
    /fallo simulado/
  );
  assert.equal(await prisma.user.count({ where: { orgId, email } }), 0);
  assert.equal(await prisma.invitation.count({ where: { orgId, email } }), 0);
});

test("QA-ALTA-11 · un rol de centro sale con su imputación primaria al 100 %", async () => {
  const email = `ok@${SLUG}.example.com`;
  const { user, invitation } = await prisma.$transaction((tx) =>
    createStaffAccount(tx, { orgId, name: "Ok", email, role: "TRAINER", centerId })
  );
  assert.equal(invitation.userId, user.id);
  const membership = await prisma.centerMembership.findFirst({ where: { userId: user.id } });
  assert.equal(membership?.centerId, centerId);
  assert.equal(membership?.isPrimary, true);
  assert.equal(membership?.allocationPct, 100);
});

test("un rol de organización no recibe imputación", async () => {
  const email = `rrhh@${SLUG}.example.com`;
  const { user } = await prisma.$transaction((tx) =>
    createStaffAccount(tx, { orgId, name: "RRHH", email, role: "HR_MANAGER", centerId: null })
  );
  assert.equal(await prisma.centerMembership.count({ where: { userId: user.id } }), 0);
});
