import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { PUBLIC_PATHS } from "@/lib/public-paths";
import { SIGNED_TOKEN_ROUTES } from "@/lib/security-headers";
import {
  INDEXABLE_PATHS,
  NOINDEX,
  NOINDEX_PUBLIC_PATHS,
  TOKEN_PAGE_METADATA,
  TOKEN_PATHS,
  indexablePathsArePublic,
  robotsRules,
  tokenPageMetadata,
} from "@/lib/seo";

/**
 * E9-02 · Lo que se comprueba aquí no es el aspecto de un robots.txt, es la
 * garantía: que nada privado y —sobre todo— ninguna de las seis rutas con token
 * firmado pueda acabar en un índice. Un `/gestionar-suscripcion/<token>` en la
 * SERP es acceso al método de pago de una persona sin contraseña.
 */

/** Las seis páginas cuyo token viaja dentro de la URL. */
const TOKEN_PAGES = TOKEN_PATHS.map((base) => `src/app${base}/[token]/page.tsx`);

test("robots.ts existe y sus reglas salen de PUBLIC_PATHS", () => {
  assert.ok(existsSync("src/app/robots.ts"), "falta src/app/robots.ts");
  const source = readFileSync("src/app/robots.ts", "utf8");
  assert.match(source, /robotsRules\(\)/);
  assert.match(source, /sitemap/);
  assert.equal(indexablePathsArePublic(), true, "hay una ruta indexable que no es pública");
});

test("la allowlist es un subconjunto estricto: público no es lo mismo que publicable", () => {
  for (const path of ["/login", "/demo-checkout", "/servicio-no-disponible", "/lead-form"]) {
    assert.ok(PUBLIC_PATHS.includes(path), `${path} debería seguir siendo pública`);
    assert.ok(!INDEXABLE_PATHS.includes(path), `${path} no puede estar en la allowlist`);
  }
  assert.ok(INDEXABLE_PATHS.includes("/planes"));
});

test("las seis rutas con token aparecen en Disallow, y el comodín cierra por detrás", () => {
  const rules = robotsRules();
  for (const path of TOKEN_PATHS) {
    assert.ok(rules.disallow.includes(path), `${path} debe estar en Disallow`);
  }
  for (const path of NOINDEX_PUBLIC_PATHS) {
    assert.ok(rules.disallow.includes(path), `${path} debe estar en Disallow`);
  }
  // Fallo seguro: una pantalla nueva nace fuera del índice.
  assert.ok(rules.disallow.includes("/"), "falta el Disallow comodín");
  assert.deepEqual(rules.allow, [...INDEXABLE_PATHS]);
});

test("las seis páginas con token declaran noindex, nofollow, nocache y no-referrer", () => {
  assert.deepEqual(TOKEN_PAGE_METADATA.robots, { index: false, follow: false, nocache: true });
  // Sin esto la URL completa —token incluido— viaja en la cabecera `Referer`
  // hacia cualquier recurso de terceros que cargue la página.
  assert.equal(TOKEN_PAGE_METADATA.referrer, "no-referrer");
  assert.equal(tokenPageMetadata("Darse de baja").title, "Darse de baja");

  for (const page of TOKEN_PAGES) {
    assert.ok(existsSync(page), `falta ${page}`);
    const source = readFileSync(page, "utf8");
    assert.match(source, /tokenPageMetadata\(/, `${page} no declara la metadata de token`);
  }
});

test("las 39 privadas se excluyen de una vez desde (app)/layout.tsx", () => {
  assert.deepEqual(NOINDEX, { index: false, follow: false });
  const layout = readFileSync("src/app/(app)/layout.tsx", "utf8");
  assert.match(layout, /export const metadata: Metadata = \{ robots: NOINDEX \}/);
});

test("demo-checkout y hazte-socio/gracias también llevan noindex", () => {
  for (const page of ["src/app/demo-checkout/page.tsx", "src/app/hazte-socio/gracias/page.tsx"]) {
    assert.match(readFileSync(page, "utf8"), /robots: NOINDEX/, `${page} no lleva noindex`);
  }
});

test("/cookies es pública y es indexable: una política que no se encuentra no cumple", () => {
  // Llegó de E10-22 como página pública y sin entrada en PUBLIC_PATHS: el proxy
  // la rebotaba a /login, así que el enlace del pie de los correos y el de la
  // propia landing no llevaban a ninguna parte.
  assert.ok(PUBLIC_PATHS.includes("/cookies"));
  assert.ok(INDEXABLE_PATHS.includes("/cookies"));
});

test("toda ruta con token firmado de las cabeceras está también en Disallow", () => {
  // `SIGNED_TOKEN_ROUTES` (E1-09) y `TOKEN_PATHS` (E9-02) son dos listas de la
  // misma cosa vistas desde dos capas: la cabecera HTTP y el robots.txt. Si una
  // crece y la otra no, una URL con token queda rastreable.
  const disallow = robotsRules().disallow;
  for (const route of SIGNED_TOKEN_ROUTES) {
    const base = route.replace(/\/:token\*$/, "");
    assert.ok(
      disallow.some((rule) => base.startsWith(rule)),
      `${route} lleva un token firmado y no lo cubre ningún Disallow`
    );
  }
});
