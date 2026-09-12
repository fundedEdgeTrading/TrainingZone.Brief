import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { APP_SCREENSHOTS } from "@/lib/app-screenshots";

/**
 * E9-16 · Página `/app`.
 *
 * No hay infraestructura en este repo para renderizar un Server Component en
 * `node:test` (los tests de página existentes en `src/app/**` no existen por
 * eso: se prueba lo puro y se lee el fuente como texto — mismo patrón que
 * `json-ld.test.ts` con `readFileSync("src/app/planes/faq.tsx")`). Lo que
 * importa comprobar es lo que puede romperse en silencio: el número de
 * capturas del guion, y que la página no anuncia una tienda que no existe.
 */

test("el guion de capturas tiene entre 6 y 8 pantallas, como pide la historia", () => {
  assert.ok(APP_SCREENSHOTS.length >= 6 && APP_SCREENSHOTS.length <= 8);
});

test("el orden es correlativo y sin huecos", () => {
  const orders = APP_SCREENSHOTS.map((s) => s.order);
  assert.deepEqual(
    orders,
    orders.map((_, i) => i + 1),
  );
});

test("cada pantalla trae un estado de demo concreto, no una descripción genérica", () => {
  for (const shot of APP_SCREENSHOTS) {
    assert.ok(shot.demoState.length > 20, `"${shot.screen}" no describe un estado de demo`);
  }
});

test("/app no enlaza a una URL de tienda inventada", () => {
  const page = readFileSync("src/app/app/page.tsx", "utf8");
  assert.doesNotMatch(page, /apps\.apple\.com|play\.google\.com\/store/);
  assert.match(page, /Próximamente en/);
  assert.match(page, /mobileApplicationJsonLd/);
});

test("la ficha de centro enlaza a /app, que es donde está el socio real", () => {
  const centerPage = readFileSync("src/app/hazte-socio/[orgSlug]/[centerSlug]/page.tsx", "utf8");
  assert.match(centerPage, /href="\/app"/);
});

test("/app y su footer compartido quedan en las rutas públicas e indexables", () => {
  const publicPaths = readFileSync("src/lib/public-paths.ts", "utf8");
  const seo = readFileSync("src/lib/seo.ts", "utf8");
  const footer = readFileSync("src/components/landing-shell.tsx", "utf8");
  assert.match(publicPaths, /"\/app"/);
  assert.match(seo, /"\/app"/);
  assert.match(footer, /href="\/app"/);
});
