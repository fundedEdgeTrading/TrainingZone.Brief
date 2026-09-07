import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { listSitemapCenters } from "@/lib/public-sitemap-queries";

/**
 * E9-06 · Lo que se comprueba es el FILTRO, que es toda la historia: un sitemap
 * que enseña gimnasios que no han pagado, organizaciones de prueba de un
 * comercial o fichas que el centro no ha querido publicar es peor que no tener
 * sitemap.
 */

const PREFIX = "e2e-sitemap-test";

before(async () => {
  await cleanup();

  const operativa = await prisma.organization.create({
    data: { name: "Operativa", slug: `${PREFIX}-operativa`, platformStatus: "ACTIVE" },
  });
  const sinPagar = await prisma.organization.create({
    data: { name: "Sin pagar", slug: `${PREFIX}-pendiente`, platformStatus: "PENDING_PAYMENT" },
  });

  await prisma.center.createMany({
    data: [
      {
        orgId: operativa.id,
        name: "Publicado",
        slug: `${PREFIX}-publicado`,
        publicPage: true,
        address: "Av. de Cataluña 42",
        description: "Entrenamiento personal y grupos reducidos.",
      },
      {
        orgId: operativa.id,
        name: "Sin publicar",
        slug: `${PREFIX}-sin-publicar`,
        publicPage: false,
        address: "Calle Mayor 1",
        description: "Todavía no quieren salir.",
      },
      {
        orgId: operativa.id,
        name: "Publicado a medias",
        slug: `${PREFIX}-a-medias`,
        publicPage: true,
        address: null,
        description: null,
      },
      {
        orgId: sinPagar.id,
        name: "De una org que no paga",
        slug: `${PREFIX}-impagada`,
        publicPage: true,
        address: "Paseo Independencia 1",
        description: "Marcado como público, pero la organización no está operativa.",
      },
    ],
  });
});

after(cleanup);

async function cleanup() {
  await prisma.center.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

test("solo entran centros de organizaciones operativas y con publicPage=true", async () => {
  const centers = await listSitemapCenters();
  const slugs = centers.filter((c) => c.centerSlug.startsWith(PREFIX)).map((c) => c.centerSlug);

  assert.deepEqual(slugs, [`${PREFIX}-publicado`]);
});

test("una ficha marcada como pública pero vacía tampoco entra", async () => {
  const centers = await listSitemapCenters();
  // Sin dirección ni descripción la página es la plantilla repetida, que es el
  // contenido duplicado que E9-04 vino a arreglar.
  assert.ok(!centers.some((c) => c.centerSlug === `${PREFIX}-a-medias`));
});

test("lastModified es una fecha real, no `new Date()` en cada rastreo", async () => {
  const centers = await listSitemapCenters();
  const publicado = centers.find((c) => c.centerSlug === `${PREFIX}-publicado`);
  assert.ok(publicado);
  assert.ok(publicado.updatedAt instanceof Date);
  assert.ok(publicado.updatedAt.getTime() <= Date.now());
});

test("ni /lead-form ni ninguna ruta con token pueden colarse en el sitemap", () => {
  const source = readFileSync("src/app/sitemap.ts", "utf8");
  // Los comentarios sí nombran esas rutas —para explicar por qué NO entran—,
  // así que se miran solo las instrucciones.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  // Las estáticas se derivan de INDEXABLE_PATHS y las de centro de
  // `membershipPath`: no hay una tercera vía por la que colar una URL a mano.
  assert.match(code, /INDEXABLE_PATHS/);
  assert.match(code, /membershipPath\(/);
  for (const forbidden of ["/lead-form", "/portal", "/dashboard", "token"]) {
    assert.ok(!code.includes(forbidden), `el sitemap no debe construir URLs con ${forbidden}`);
  }
});
