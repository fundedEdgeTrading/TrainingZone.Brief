import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * E8-06 · `<h1>` real en el header y enlace de salto al contenido.
 * `header.tsx:79-85` pintaba el título de ruta en un `<div>`: el documento
 * no tenía ningún `<h1>`. Doce pantallas pintaban el suyo propio, duplicando
 * el encabezado principal en cuanto se corrigiera el del header.
 */

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...sourceFiles(full));
    else if (/\.tsx$/.test(entry.name)) found.push(full);
  }
  return found;
}

test("E8-06 · el título de ruta del header es un h1", () => {
  const header = readFileSync(join("src", "app", "(app)", "header.tsx"), "utf8");
  assert.match(header, /<h1[\s>]/);
});

test("E8-06 · ninguna otra pantalla de (app) duplica el h1 (salvo el documento imprimible)", () => {
  // El documento imprimible del mesociclo (`PrintDocument`, `hidden
  // print:block`) es un documento aparte que solo existe en @media print,
  // no una pantalla del DOM visible bajo el header: su h1 es legítimo.
  const printOnlyFile = join("src", "app", "(app)", "members", "[id]", "mesociclos", "[mesocycleId]", "editor.tsx");
  const files = sourceFiles(join("src", "app", "(app)")).filter(
    (f) => f !== join("src", "app", "(app)", "header.tsx") && f !== printOnlyFile
  );
  const offenders = files.filter((f) => /<h1[\s>]/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, [], `h1 duplicado en: ${offenders.join(", ")}`);

  const printSource = readFileSync(printOnlyFile, "utf8");
  assert.equal((printSource.match(/<h1[\s>]/g) ?? []).length, 1, "el editor debería conservar exactamente el h1 del documento imprimible");
  assert.match(printSource, /print:block/);
});

test("E8-06 · existe un enlace de salto al contenido, antes del sidebar", () => {
  const layout = readFileSync(join("src", "app", "(app)", "layout.tsx"), "utf8");
  const skipIndex = layout.indexOf("Saltar al contenido");
  const sidebarIndex = layout.indexOf("<Sidebar");
  assert.ok(skipIndex > -1, "falta el enlace de salto al contenido");
  assert.ok(sidebarIndex > -1 && skipIndex < sidebarIndex, "el salto al contenido debe ir antes del Sidebar en el DOM");
  assert.match(layout, /id="main-content"/);
  assert.match(layout, /href="#main-content"/);
});
