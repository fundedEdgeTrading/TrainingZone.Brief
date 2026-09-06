import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { requireApiCenterScope, requireApiFeature } from "@/app/api/mobile/v1/_lib/api-guards";
import type { ApiTokenClaims } from "@/lib/mobile-auth";

/**
 * Las dos guardas que la app móvil no tenía y la web sí. El patrón "espejo
 * móvil" —web comprueba, app no— es el fallo que más se repite en este código,
 * así que se prueba contra la base de datos real y no con dobles.
 */

const SLUG = "e2e-api-guards-test";

type Fixture = {
  orgId: string;
  otherOrgId: string;
  centerA: string;
  centerB: string;
  otherOrgCenter: string;
  directorId: string;
  ownerId: string;
};
let fx: Fixture;

async function makeUser(orgId: string, tag: string, role: "OWNER" | "CENTER_DIRECTOR", centerId: string | null) {
  const email = `${SLUG}-${tag}@example.com`;
  const identity = await prisma.identity.create({ data: { email, passwordHash: "no-usable-en-tests" } });
  return prisma.user.create({ data: { orgId, identityId: identity.id, name: tag, email, role, centerId } });
}

before(async () => {
  const org = await prisma.organization.create({
    // Plan Esencial: `features: []`. Es la organización de la fuga verificada.
    data: { name: "Guardas", slug: SLUG, platformPlan: "esencial_mes", platformStatus: "ACTIVE" },
  });
  const other = await prisma.organization.create({ data: { name: "Otra", slug: `${SLUG}-otra` } });
  const centerA = await prisma.center.create({ data: { orgId: org.id, name: "A", slug: `${SLUG}-a` } });
  const centerB = await prisma.center.create({ data: { orgId: org.id, name: "B", slug: `${SLUG}-b` } });
  const otherCenter = await prisma.center.create({ data: { orgId: other.id, name: "C", slug: `${SLUG}-c` } });
  const director = await makeUser(org.id, "director", "CENTER_DIRECTOR", centerA.id);
  const owner = await makeUser(org.id, "owner", "OWNER", null);
  fx = {
    orgId: org.id,
    otherOrgId: other.id,
    centerA: centerA.id,
    centerB: centerB.id,
    otherOrgCenter: otherCenter.id,
    directorId: director.id,
    ownerId: owner.id,
  };
});

after(async () => {
  if (!fx) return;
  await prisma.user.deleteMany({ where: { orgId: { in: [fx.orgId, fx.otherOrgId] } } });
  await prisma.identity.deleteMany({ where: { email: { startsWith: SLUG } } });
  await prisma.center.deleteMany({ where: { orgId: { in: [fx.orgId, fx.otherOrgId] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [fx.orgId, fx.otherOrgId] } } });
  await prisma.$disconnect();
});

function claimsFor(userId: string, role: ApiTokenClaims["role"], centerId: string | null): ApiTokenClaims {
  return { sub: userId, role, orgId: fx.orgId, centerId };
}

test("requireApiCenterScope · dirección de centro solo opera sobre los suyos", async () => {
  const claims = claimsFor(fx.directorId, "CENTER_DIRECTOR", fx.centerA);

  assert.equal((await requireApiCenterScope(claims, fx.centerA)).ok, true);

  const blocked = await requireApiCenterScope(claims, fx.centerB);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok === false && blocked.response.status, 403);
});

test("requireApiCenterScope · un centerId de otra organización no pasa ni siendo dirección", async () => {
  // `isCenterInScope` por sí solo devuelve `true` para los roles de ámbito
  // organización sin mirar el `orgId`: la frontera multi-tenant la pone esta
  // guarda, y por eso se prueba con el rol que más manda.
  const claims = claimsFor(fx.ownerId, "OWNER", null);
  assert.equal((await requireApiCenterScope(claims, fx.centerB)).ok, true, "los suyos, todos");

  const blocked = await requireApiCenterScope(claims, fx.otherOrgCenter);
  assert.equal(blocked.ok, false, "el de otra organización, ninguno");
  assert.equal(blocked.ok === false && blocked.response.status, 403);
});

test("requireApiFeature · plan Esencial recibe 402, no 200 ni 403", async () => {
  const claims = claimsFor(fx.directorId, "CENTER_DIRECTOR", fx.centerA);

  const blocked = await requireApiFeature(claims, "salud_aptitud");
  assert.equal(blocked.ok, false);
  // 402 y no 403: no es un problema de permisos, es que no está contratado —
  // la app necesita distinguirlo para ofrecer el cambio de plan.
  assert.equal(blocked.ok === false && blocked.response.status, 402);
});

test("requireApiFeature · con la funcionalidad contratada, todo sigue igual", async () => {
  await prisma.organization.update({ where: { id: fx.orgId }, data: { platformPlan: "avanzado_mes" } });
  const claims = claimsFor(fx.directorId, "CENTER_DIRECTOR", fx.centerA);

  assert.equal((await requireApiFeature(claims, "salud_aptitud")).ok, true);
  // E6-04: la IA entra en Avanzado con cupo (el cupo en sí lo aplica E6-03).
  assert.equal((await requireApiFeature(claims, "ia_programacion")).ok, true);

  await prisma.organization.update({ where: { id: fx.orgId }, data: { platformPlan: "esencial_mes" } });
});

test("requireApiFeature · plan Esencial sigue sin ia_programacion", async () => {
  const claims = claimsFor(fx.directorId, "CENTER_DIRECTOR", fx.centerA);
  assert.equal((await requireApiFeature(claims, "ia_programacion")).ok, false);
});

test("requireApiFeature · soporte de Apta queda exento", async () => {
  const claims: ApiTokenClaims = { sub: fx.ownerId, role: "PLATFORM_ADMIN", orgId: fx.orgId, centerId: null };
  assert.equal((await requireApiFeature(claims, "salud_aptitud")).ok, true);
});
