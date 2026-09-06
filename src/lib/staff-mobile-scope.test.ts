import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { signAccessToken } from "@/lib/mobile-auth";
import { getStaffWithMemberships } from "@/lib/org-queries";
import { staffScopeFilter } from "@/lib/staff-queries";
import { GET as staffRoute } from "@/app/api/mobile/v1/staff/route";

/**
 * E1-04 (RB-SEG-002): `GET /api/mobile/v1/staff` devuelve solo la plantilla del
 * ámbito.
 *
 * Verificado antes del arreglo: dirección de La Jota recibía 28 personas, las 8
 * de Santander incluidas, con email, rol e imputaciones. Las escrituras sí
 * estaban acotadas (`findStaffInScope`): era fuga de lectura, y solo en la app
 * — la web ya aplicaba `staffScopeWhere` y tenía un e2e que lo probaba.
 *
 * Por eso el test central es el de PARIDAD: no comprueba una lista escrita a
 * mano, sino que el endpoint y la web devuelven el mismo conjunto para el mismo
 * usuario. Una divergencia futura entre las dos superficies falla aquí, que es
 * exactamente la forma que tuvo este fallo.
 */

const SUFFIX = "test-staff-mobile-scope";

type Person = { id: string; email: string };
type Fixture = {
  orgId: string;
  laJota: string;
  santander: string;
  directorJota: Person;
  trainerJota: Person;
  trainerSantander: Person;
  owner: Person;
  hr: Person;
};
let fx: Fixture;

async function staffFromApi(user: Person, role: Role, centerId: string | null) {
  const token = await signAccessToken({ sub: user.id, role, orgId: fx.orgId, centerId });
  const res = await staffRoute(
    new NextRequest("http://localhost/api/mobile/v1/staff", { headers: { authorization: `Bearer ${token}` } })
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    data: { centers: { id: string; name: string }[]; staff: { id: string; email: string }[] };
  };
  return body.data;
}

/** El mismo conjunto que pinta la web para ese usuario (`/rrhh` → `/organization`). */
async function staffFromWeb(user: Person, role: Role, centerId: string | null) {
  const scopedUser = { id: user.id, role, orgId: fx.orgId, centerId };
  const rows = await getStaffWithMemberships(fx.orgId, { scope: await staffScopeFilter(scopedUser) });
  return rows.map((r) => r.id).sort();
}

async function wipe() {
  const orgs = await prisma.organization.findMany({
    where: { slug: { startsWith: SUFFIX } },
    select: { id: true },
  });
  for (const { id: orgId } of orgs) {
    await prisma.centerMembership.deleteMany({ where: { orgId } });
    const users = await prisma.user.findMany({ where: { orgId }, select: { identityId: true } });
    await prisma.user.deleteMany({ where: { orgId } });
    await prisma.identity.deleteMany({ where: { id: { in: users.map((u) => u.identityId) } } });
    await prisma.center.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
}

before(async () => {
  await wipe();
  const org = await prisma.organization.create({
    data: { name: "Plantilla", slug: SUFFIX, platformPlan: "avanzado_mes", platformStatus: "ACTIVE" },
  });
  const laJota = await prisma.center.create({ data: { orgId: org.id, name: "La Jota", slug: `${SUFFIX}-a` } });
  const santander = await prisma.center.create({ data: { orgId: org.id, name: "Santander", slug: `${SUFFIX}-b` } });

  const makeUser = async (tag: string, role: Role, centerId: string | null): Promise<Person> => {
    const email = `${SUFFIX}-${tag}@example.com`;
    const identity = await prisma.identity.create({ data: { email, passwordHash: "x" } });
    const user = await prisma.user.create({
      data: { orgId: org.id, identityId: identity.id, name: tag, email, role, centerId },
    });
    if (centerId) {
      await prisma.centerMembership.create({
        data: { orgId: org.id, userId: user.id, centerId, role, isPrimary: true },
      });
    }
    return { id: user.id, email };
  };

  fx = {
    orgId: org.id,
    laJota: laJota.id,
    santander: santander.id,
    directorJota: await makeUser("director-jota", "CENTER_DIRECTOR", laJota.id),
    trainerJota: await makeUser("trainer-jota", "TRAINER", laJota.id),
    trainerSantander: await makeUser("trainer-santander", "TRAINER", santander.id),
    owner: await makeUser("owner", "OWNER", null),
    hr: await makeUser("hr", "HR_MANAGER", null),
  };
});

after(async () => {
  await wipe();
  await prisma.$disconnect();
});

test("E1-04 · dirección de centro no recibe a nadie ajeno a su ámbito", async () => {
  const { staff, centers } = await staffFromApi(fx.directorJota, "CENTER_DIRECTOR", fx.laJota);
  const emails = staff.map((s) => s.email);

  assert.ok(emails.includes(fx.trainerJota.email), "sí ve a su propio equipo");
  assert.ok(!emails.includes(fx.trainerSantander.email), "no ve la plantilla de Santander");
  // Los roles de ámbito organización tampoco son "de su centro".
  assert.ok(!emails.includes(fx.owner.email));
  assert.ok(!emails.includes(fx.hr.email));

  // Y el selector de centro no ofrece más de lo que gestiona.
  assert.deepEqual(centers.map((c) => c.id), [fx.laJota]);
});

test("E1-04 · dirección de organización recibe la plantilla completa", async () => {
  const { staff, centers } = await staffFromApi(fx.owner, "OWNER", null);
  const emails = staff.map((s) => s.email);

  for (const person of [fx.directorJota, fx.trainerJota, fx.trainerSantander, fx.owner, fx.hr]) {
    assert.ok(emails.includes(person.email), `falta ${person.email}`);
  }
  assert.equal(centers.length, 2);
});

test("E1-04 · RRHH recibe el mismo alcance que en la web para su rol", async () => {
  const { staff } = await staffFromApi(fx.hr, "HR_MANAGER", null);
  assert.deepEqual(staff.map((s) => s.id).sort(), await staffFromWeb(fx.hr, "HR_MANAGER", null));
});

test("E1-04 · paridad: para cualquier rol, la app y la web devuelven el mismo conjunto", async () => {
  const cases: [Person, Role, string | null][] = [
    [fx.directorJota, "CENTER_DIRECTOR", fx.laJota],
    [fx.owner, "OWNER", null],
    [fx.hr, "HR_MANAGER", null],
  ];
  for (const [person, role, centerId] of cases) {
    const { staff } = await staffFromApi(person, role, centerId);
    assert.deepEqual(
      staff.map((s) => s.id).sort(),
      await staffFromWeb(person, role, centerId),
      `divergen app y web para ${role}`
    );
  }
});
