import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PUBLIC_CENTER_REVALIDATE } from "@/lib/public-membership-queries";
import { centerPublicTag, orgCatalogTag } from "@/lib/public-center-seo";

/**
 * E9-14 · La ficha de centro no tenía `revalidate` ni `generateStaticParams`, y
 * hacía dos consultas secuenciales más el catálogo más la comprobación de
 * Stripe **en cada visita** — para una página que cambia cuando el gimnasio
 * edita su ficha, es decir casi nunca.
 */

const MEMBERSHIP_PAGE = "src/app/hazte-socio/[orgSlug]/[centerSlug]/page.tsx";
const LEAD_PAGE = "src/app/lead-form/[orgSlug]/[centerSlug]/page.tsx";
const PLANES_PAGE = "src/app/planes/page.tsx";
const ORG_ACTIONS = "src/app/(app)/organization/actions.ts";

test("las páginas de centro declaran revalidate = 600", () => {
  assert.equal(PUBLIC_CENTER_REVALIDATE, 600);
  for (const page of [MEMBERSHIP_PAGE, LEAD_PAGE]) {
    assert.match(readFileSync(page, "utf8"), /export const revalidate = 600;/, `${page} no declara revalidate`);
  }
});

test("/planes NO se cachea: su force-dynamic está justificado", () => {
  const planes = readFileSync(PLANES_PAGE, "utf8");
  assert.match(planes, /export const dynamic = "force-dynamic"/);
  assert.ok(!/export const revalidate/.test(planes), "/planes no puede cachearse: los precios salen del entorno");
});

test("la caché se invalida al editar el centro y al tocar el catálogo", () => {
  const actions = readFileSync(ORG_ACTIONS, "utf8");
  // Editar la ficha: se invalida ese centro.
  assert.match(actions, /updateTag\(centerPublicTag\(center\.organization\.slug, center\.slug\)\)/);
  // Tocar una tarifa: se invalidan TODOS los centros de la organización, porque
  // el catálogo es de organización y sale en todas sus fichas.
  assert.match(actions, /updateTag\(orgCatalogTag\(org\.slug\)\)/);
  const invalidations = [...actions.matchAll(/await invalidateOrgCatalog\(/g)];
  assert.equal(invalidations.length, 3, "alta, edición y archivado de tarifa deben invalidar el catálogo");
});

test("las etiquetas se escriben igual en las dos puntas, y son por URL", () => {
  // La página se cachea antes de saber el id del centro: la clave es la URL.
  assert.equal(centerPublicTag("training-zone", "la-jota"), "center-public:training-zone/la-jota");
  assert.equal(orgCatalogTag("training-zone"), "org-catalog:training-zone");

  const membership = readFileSync("src/lib/public-membership-queries.ts", "utf8");
  assert.match(membership, /tags: \[centerPublicTag\(orgSlug, centerSlug\), orgCatalogTag\(orgSlug\)\]/);
});

test("el checkout y las acciones NO leen de caché", () => {
  // Cobrar un precio de hace diez minutos no es una optimización, es un error
  // de facturación.
  for (const file of [
    "src/app/api/hazte-socio/[orgSlug]/[centerSlug]/checkout/route.ts",
    "src/app/hazte-socio/[orgSlug]/[centerSlug]/actions.ts",
    "src/app/lead-form/[orgSlug]/[centerSlug]/actions.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.ok(!/getCachedPublic/.test(source), `${file} está leyendo el contexto cacheado`);
  }

  // Y las páginas SÍ.
  assert.match(readFileSync(MEMBERSHIP_PAGE, "utf8"), /getCachedPublicMembershipContext/);
  assert.match(readFileSync(LEAD_PAGE, "utf8"), /getCachedPublicLeadFormContext/);
});

test("la ficha no lee searchParams en el servidor: eso la haría dinámica en cada visita", () => {
  // Solo el código: el comentario del fichero nombra `searchParams` justamente
  // para explicar por qué ya no se lee.
  const page = readFileSync(MEMBERSHIP_PAGE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  assert.ok(!/searchParams/.test(page), "leer searchParams en el servidor tira la caché de la ruta");
  assert.match(page, /<CheckoutNotice \/>/);
});
