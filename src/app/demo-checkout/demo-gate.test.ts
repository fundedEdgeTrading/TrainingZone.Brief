import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * PROD-01 · todo `/demo-checkout/**` depende de `isDemoModeActive` (DEMO_MODE),
 * y con el modo apagado las PÁGINAS dan 404 en vez de redirigir.
 *
 * No se puede renderizar una página de servidor en este harness, así que se
 * comprueba por código fuente, como `login-form.test.ts`. La lógica de la
 * bandera se prueba de verdad en `lib/platform-plans-demo-mode.test.ts`.
 */

const ROOT = join("src", "app", "demo-checkout");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const FILES = walk(ROOT);
const PAGES = FILES.filter((f) => /page\.tsx$/.test(f));
const ACTIONS = FILES.filter((f) => /actions\.ts$/.test(f));

test("PROD-01 · hay un layout que corta toda la carpeta con notFound()", () => {
  const layout = readFileSync(join(ROOT, "layout.tsx"), "utf8");
  assert.match(layout, /if \(!isDemoModeActive\(\)\) notFound\(\)/);
});

test("PROD-01 · cada página de /demo-checkout da 404 con el modo demo apagado, sin redirigir", () => {
  assert.ok(PAGES.length >= 2, "se esperaban al menos /demo-checkout y /demo-checkout/socio");
  for (const page of PAGES) {
    const source = readFileSync(page, "utf8");
    assert.match(source, /if \(!isDemoModeActive\(\)\) notFound\(\)/, page);
    assert.doesNotMatch(source, /isDemoModeActive\(\)\)\s*redirect\(/, page);
  }
});

test("PROD-01 · cada server action de /demo-checkout comprueba isDemoModeActive antes de hacer nada", () => {
  assert.ok(ACTIONS.length >= 2);
  for (const file of ACTIONS) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /if \(!isDemoModeActive\(\)\) return \{ ok: false/, file);
  }
});
