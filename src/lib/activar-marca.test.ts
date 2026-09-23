import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * QA-ALTA-17 · `/activar` es lo que ve el director que acaba de pagar, y le
 * hablaba de "Apta": el rediseño retiró esa marca de cara al cliente y la
 * plataforma firma como Training Zone (docs/BRANDING.md §1, RB-MARCA-001, y
 * los propios correos de activación de `provisioning.ts`). Un `page.tsx` no
 * puede exportar sus textos, así que se comprueba el fuente.
 */
test("QA-ALTA-17 · /activar no nombra la marca retirada en ningún texto", () => {
  const source = readFileSync(path.join(process.cwd(), "src/app/activar/page.tsx"), "utf8");
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.equal(/\bApta\b/.test(withoutComments), false);
  assert.match(withoutComments, /Training Zone/);
});
