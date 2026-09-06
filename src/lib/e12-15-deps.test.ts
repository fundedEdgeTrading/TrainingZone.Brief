import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * E12-15 · override para mysql2 y limpieza de dependencias muertas.
 * `npm audit` reportaba 2 vulnerabilidades (1 alta) por mysql2, arrastrado
 * transitivamente por Prisma aunque el proyecto usa el adaptador de
 * Postgres. `react-leaflet` estaba en dependencies sin un solo import, y
 * cinco SVG de plantilla de Next quedaban en public/.
 */

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

test("E12-15 · package.json fija un override para mysql2", () => {
  assert.ok(pkg.overrides?.mysql2, "falta el override de mysql2 en package.json");
});

test("E12-15 · react-leaflet se retira de dependencies", () => {
  assert.equal(pkg.dependencies?.["react-leaflet"], undefined);
});

test("E12-15 · los cinco SVG de plantilla de Next se borran de public/", () => {
  for (const file of ["file.svg", "globe.svg", "next.svg", "vercel.svg", "window.svg"]) {
    assert.equal(existsSync(`public/${file}`), false, `public/${file} debería haberse borrado`);
  }
});
