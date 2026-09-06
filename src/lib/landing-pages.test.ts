import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { prisma } from "@/lib/prisma";
import { CORE_FEATURES } from "@/lib/platform-plans";
import { PUBLIC_PATHS } from "@/lib/public-paths";
import { INDEXABLE_PATHS } from "@/lib/seo";
import {
  ALL_LANDING_PAGES,
  FEATURE_PAGES,
  VERTICAL_PAGES,
  citySlug,
  featurePage,
  featurePath,
  verticalPage,
  verticalPath,
} from "@/lib/landing-pages";
import { listDirectoryCities } from "@/lib/public-sitemap-queries";
import { membershipPath } from "@/lib/public-center-seo";

/**
 * E9-11 · El inventario indexable eran CUATRO URLs contra competidores con
 * blogs de cientos de artículos. Lo que se comprueba aquí es que las nuevas
 * existen de verdad —ruta en disco, ruta pública, ruta indexable— y que el
 * índice de centros resuelve la orfandad.
 */

const PREFIX = "e2e-centros-test";

before(async () => {
  await cleanup();
  const org = await prisma.organization.create({
    data: { name: "Directorio", slug: `${PREFIX}-org`, platformStatus: "ACTIVE" },
  });
  await prisma.center.createMany({
    data: [
      {
        orgId: org.id,
        name: "Centro Zaragoza",
        slug: `${PREFIX}-zgz`,
        publicPage: true,
        address: "Av. de Cataluña 42",
        description: "Grupos reducidos junto al Ebro.",
        city: "Zaragoza",
        neighborhood: "La Jota",
      },
      {
        orgId: org.id,
        // Misma ciudad, escrita distinto: tiene que caer en el mismo grupo.
        name: "Centro Zaragoza Sur",
        slug: `${PREFIX}-zgz-sur`,
        publicPage: true,
        address: "Calle Mayor 1",
        description: "Entrenamiento personal.",
        city: "zaragoza",
      },
      {
        orgId: org.id,
        name: "Centro sin ciudad",
        slug: `${PREFIX}-sin-ciudad`,
        publicPage: true,
        address: "Sin ciudad 1",
        description: "No tiene ciudad cargada.",
        city: null,
      },
    ],
  });
});

after(cleanup);

async function cleanup() {
  await prisma.center.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.organization.deleteMany({ where: { slug: { startsWith: PREFIX } } });
}

test("hay una página por funcionalidad, y salen de CORE_FEATURES", () => {
  assert.equal(FEATURE_PAGES.length, CORE_FEATURES.length);
  // Si mañana entra una séptima capacidad al núcleo sin su página, el módulo
  // lanza al importarse: es un fallo ruidoso y no una landing que promete algo
  // sin dónde aterrizar.
  for (const page of FEATURE_PAGES) {
    assert.ok(page.slug && page.h1 && page.title && page.description && page.intro);
    assert.ok(page.bullets.length >= 3, `${page.slug} necesita al menos tres puntos`);
  }
  assert.equal(featurePage("gestion-de-socios")?.slug, "gestion-de-socios");
  assert.equal(featurePage("no-existe"), null);
});

test("existen los tres verticales que el hero ya nombraba", () => {
  assert.deepEqual(
    VERTICAL_PAGES.map((p) => p.slug),
    ["box-crossfit", "entrenamiento-personal", "pilates"]
  );
  assert.equal(verticalPage("pilates")?.slug, "pilates");
});

test("ningún slug se repite y ningún título es igual a otro", () => {
  const slugs = ALL_LANDING_PAGES.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length, "hay slugs repetidos");
  const titles = ALL_LANDING_PAGES.map((p) => p.title);
  // Dos páginas con el mismo título son dos páginas que Google agrupa: el
  // problema exacto que E9-04 arregló en las fichas de centro.
  assert.equal(new Set(titles).size, titles.length, "hay títulos repetidos");
});

test("las rutas nuevas existen en disco y son públicas e indexables", () => {
  for (const file of [
    "src/app/funcionalidades/page.tsx",
    "src/app/funcionalidades/[slug]/page.tsx",
    "src/app/para/[vertical]/page.tsx",
    "src/app/centros/page.tsx",
    "src/app/centros/[ciudad]/page.tsx",
  ]) {
    assert.ok(existsSync(file), `falta ${file}`);
  }

  for (const prefix of ["/funcionalidades", "/para", "/centros"]) {
    assert.ok(PUBLIC_PATHS.includes(prefix), `${prefix} no es pública: el proxy la rebotaría a /login`);
    assert.ok(INDEXABLE_PATHS.includes(prefix), `${prefix} no está en la allowlist de robots.txt`);
  }

  assert.equal(featurePath("crm-de-leads"), "/funcionalidades/crm-de-leads");
  assert.equal(verticalPath("pilates"), "/para/pilates");
});

test("las rutas dinámicas declaran su juego completo de parámetros", () => {
  // `generateStaticParams` enumera las seis funcionalidades y los tres
  // verticales. Hoy el layout raíz lee `headers()` y la sesión, así que la
  // renderización acaba siendo dinámica de todas formas; la declaración sigue
  // siendo la que fija qué URLs existen —y la que las prerrenderizará el día que
  // ese handoff deje de forzar dinamismo— en vez de dejarlo a lo que alguien
  // escriba en la barra.
  for (const file of ["src/app/funcionalidades/[slug]/page.tsx", "src/app/para/[vertical]/page.tsx"]) {
    assert.match(readFileSync(file, "utf8"), /export function generateStaticParams/, `${file} no declara sus rutas`);
  }
});

test("cada página de centro se alcanza desde su índice, sin escribir la URL a mano", async () => {
  const cities = await listDirectoryCities();
  const zaragoza = cities.find((c) => c.slug === "zaragoza");
  assert.ok(zaragoza, "la ciudad de prueba no aparece en el índice");

  const mios = zaragoza.centers.filter((c) => c.centerSlug.startsWith(PREFIX));
  // "Zaragoza" y "zaragoza" son la misma ciudad: se agrupan por slug.
  assert.equal(mios.length, 2);

  // Y el enlace del índice es exactamente la URL canónica de la ficha.
  assert.equal(
    membershipPath(mios[0].orgSlug, mios[0].centerSlug),
    `/hazte-socio/${PREFIX}-org/${PREFIX}-zgz`
  );

  // Sin ciudad no hay grupo bajo el que colocarlo, y un cajón de "otros" sería
  // inventar una categoría.
  assert.ok(!cities.some((c) => c.centers.some((x) => x.centerSlug === `${PREFIX}-sin-ciudad`)));
});

test("el slug de ciudad normaliza tildes y mayúsculas", () => {
  assert.equal(citySlug("Zaragoza"), "zaragoza");
  assert.equal(citySlug("zaragoza"), "zaragoza");
  assert.equal(citySlug("Alcalá de Henares"), "alcala-de-henares");
  assert.equal(citySlug("  A Coruña  "), "a-coruna");
});

test("todas las nuevas están enlazadas desde /planes: el sitemap no basta", () => {
  const planes = readFileSync("src/app/planes/page.tsx", "utf8");
  // Una página que solo vive en el sitemap es, para Google, secundaria; y para
  // un visitante, inexistente.
  assert.match(planes, /featurePath\(page\.slug\)/);
  assert.match(planes, /verticalPath\(page\.slug\)/);
  assert.match(planes, /href="\/centros"/);
});
