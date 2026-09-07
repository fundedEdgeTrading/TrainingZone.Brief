import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_BY_ROLE } from "@/lib/rbac";

/**
 * E8-17 · `src/lib/rbac.ts` está congelado este trimestre, así que el cambio
 * del menú a cinco secciones se deja diseñado en
 * `docs/hu/patches-rbac/E8-17-menu-cinco-secciones.md` para que el
 * integrador lo aplique. Lo único verificable sin tocar el fichero
 * congelado es que la propuesta no se ha desincronizado del código real:
 * cada `href` que menciona ya existe HOY en NAV_BY_ROLE.OWNER o
 * NAV_BY_ROLE.CENTER_DIRECTOR, y el fichero de diseño sigue en su sitio.
 */

const DOC_PATH = join("docs", "hu", "patches-rbac", "E8-17-menu-cinco-secciones.md");

test("E8-17 · el documento de la propuesta existe", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  assert.match(doc, /NavSection/);
  assert.match(doc, /"Hoy"/);
  assert.match(doc, /"Socios"/);
  assert.match(doc, /"Dinero"/);
  assert.match(doc, /"Crecer"/);
  assert.match(doc, /"Ajustes"/);
});

test("E8-17 · cada href propuesto para OWNER/CENTER_DIRECTOR existe hoy en rbac.ts", () => {
  const doc = readFileSync(DOC_PATH, "utf8");
  const hrefs = [...doc.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(hrefs.length > 10, "la propuesta debería listar bastantes rutas");

  const currentHrefs = new Set([...NAV_BY_ROLE.OWNER, ...NAV_BY_ROLE.CENTER_DIRECTOR].map((i) => i.href));
  const unknown = hrefs.filter((h) => !currentHrefs.has(h));
  assert.deepEqual(unknown, [], `La propuesta referencia rutas que ya no existen en NAV_BY_ROLE: ${unknown.join(", ")}`);
});

test("E8-17 · /aforo no se retira del rol que sí lo necesita (TRAINER_ADMIN)", () => {
  assert.ok(
    NAV_BY_ROLE.TRAINER_ADMIN.some((i) => i.href === "/aforo"),
    "TRAINER_ADMIN no tiene acceso a /organization: no se le puede quitar /aforo del menú"
  );
});
