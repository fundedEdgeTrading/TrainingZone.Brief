import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "@/lib/prisma";
import { getPublicCenterLinks, getSetupChecklist } from "@/lib/setup-checklist";
import { leadFormPath, membershipPath } from "@/lib/public-center-seo";

/**
 * E9-15 · La puesta en marcha tenía siete pasos y ninguno enseñaba la URL
 * pública del centro. `/organization` recogía el `slug` y no lo devolvía jamás
 * como enlace, así que el embudo comercial completo solo era alcanzable si el
 * gimnasio construía la dirección a mano.
 */

const PREFIX = "e2e-enlaces-test";
let orgId = "";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({
    data: { name: "Enlaces", slug: `${PREFIX}-org`, platformStatus: "ACTIVE" },
  });
  orgId = org.id;
  await prisma.center.createMany({
    data: [
      { orgId, name: "Centro publicado", slug: `${PREFIX}-publicado`, publicPage: true },
      { orgId, name: "Centro sin publicar", slug: `${PREFIX}-privado`, publicPage: false },
    ],
  });
});

after(cleanup);

async function cleanup() {
  await prisma.center.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

test("existe un paso «Tus enlaces públicos» en la puesta en marcha", async () => {
  const steps = await getSetupChecklist(orgId);
  const step = steps.find((s) => s.id === "enlaces");
  assert.ok(step, "falta el paso de enlaces públicos");
  assert.equal(step.label, "Tus enlaces públicos");
  // No bloquea: se puede operar sin publicar la página, solo no se capta por
  // buscador.
  assert.equal(step.blocking, false);
});

test("el paso se da por hecho cuando hay al menos un centro publicado", async () => {
  const withPublished = await getSetupChecklist(orgId);
  assert.equal(withPublished.find((s) => s.id === "enlaces")?.done, true);

  await prisma.center.updateMany({ where: { orgId }, data: { publicPage: false } });
  const withoutPublished = await getSetupChecklist(orgId);
  assert.equal(withoutPublished.find((s) => s.id === "enlaces")?.done, false);

  await prisma.center.updateMany({ where: { slug: `${PREFIX}-publicado` }, data: { publicPage: true } });
});

test("cada centro trae sus dos URLs públicas, y su estado de publicación", async () => {
  const { orgSlug, centers } = await getPublicCenterLinks(orgId);
  assert.equal(orgSlug, `${PREFIX}-org`);
  assert.deepEqual(
    centers.map((c) => c.slug),
    [`${PREFIX}-publicado`, `${PREFIX}-privado`]
  );
  assert.deepEqual(
    centers.map((c) => c.publicPage),
    [true, false]
  );

  const publicado = centers[0];
  assert.equal(membershipPath(orgSlug, publicado.slug), `/hazte-socio/${PREFIX}-org/${PREFIX}-publicado`);
  assert.equal(leadFormPath(orgSlug, publicado.slug), `/lead-form/${PREFIX}-org/${PREFIX}-publicado`);
});
