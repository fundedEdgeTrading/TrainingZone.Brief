import test from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Topology } from "topojson-specification";

import {
  BARRIOS_OBJECT,
  CITY_GEOMETRY_BUDGET_GZ,
  coversCity,
  ringsFromTopology,
} from "@/lib/barrio-geojson";

/**
 * E11-08 · Geometría real de barrio, con respaldo a la teselación.
 *
 * Es la mejora que más precisión aporta por menos código porque **la vista ya
 * trabaja sobre anillos**: color, etiquetas, foco y encuadre no distinguen si el
 * anillo sale de `tessellate()` o de un contorno del ayuntamiento. Y de paso
 * elimina el acantilado de `tessellate()`, que es O(n²) y síncrono en el hilo
 * principal (1.200 barrios → 150 ms; 2.500 → 603 ms).
 */

const GEO_DIR = path.join("src", "data", "geo");

/** Un TopoJSON mínimo con dos barrios cuadrados y contiguos. */
function topology(): Topology {
  return {
    type: "Topology",
    // Dos arcos: el cuadrado de la izquierda y el de la derecha.
    arcs: [
      [
        [0, 0],
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ],
    ],
    transform: { scale: [0.001, 0.001], translate: [-0.9, 41.6] },
    objects: {
      [BARRIOS_OBJECT]: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", arcs: [[0]], properties: { code: "50001", name: "Casco Histórico" } },
          { type: "Polygon", arcs: [[1]], properties: { code: "50002", name: "La Magdalena" } },
        ],
      },
    },
  } as unknown as Topology;
}

test("topojson-client sustituye a tessellate(): un anillo por código postal", () => {
  const rings = ringsFromTopology(topology());
  assert.deepEqual(Object.keys(rings.byCode).sort(), ["50001", "50002"]);
  assert.equal(rings.skipped, 0);
  // Y el anillo llega en el formato que consume `L.polygon`.
  assert.ok(rings.byCode["50001"].length >= 4);
  for (const [lat, lng] of rings.byCode["50001"]) {
    assert.equal(typeof lat, "number");
    assert.equal(typeof lng, "number");
  }
});

test("el par llega como [lat, lng], no como [lng, lat]", () => {
  // Es la confusión que deja los mapas en el golfo de Guinea. La geometría de
  // prueba está en Zaragoza: latitud ≈ 41,6 y longitud ≈ −0,9.
  const rings = ringsFromTopology(topology());
  for (const [lat, lng] of rings.byCode["50001"]) {
    assert.ok(lat > 41 && lat < 42, `latitud fuera de sitio: ${lat}`);
    assert.ok(lng > -1 && lng < 0, `longitud fuera de sitio: ${lng}`);
  }
});

test("un contorno sin `code` se descarta en vez de colarse sin poder colorearse", () => {
  const broken = topology();
  const geometries = (broken.objects[BARRIOS_OBJECT] as { geometries: { properties: unknown }[] }).geometries;
  geometries[1].properties = { name: "Sin código" };

  const rings = ringsFromTopology(broken);
  assert.deepEqual(Object.keys(rings.byCode), ["50001"]);
  assert.equal(rings.skipped, 1);
});

test("un TopoJSON sin el objeto «barrios» no revienta: devuelve vacío", () => {
  const rings = ringsFromTopology({ type: "Topology", arcs: [], objects: {} } as unknown as Topology);
  assert.deepEqual(rings.byCode, {});
});

test("o cubre TODOS los barrios de la ciudad, o se usa la teselación entera", () => {
  const rings = ringsFromTopology(topology());
  assert.equal(coversCity(rings, ["50001", "50002"]), true);
  // Media ciudad con contorno real y media aproximada es un mapa a dos
  // criterios: peor que uno aproximado entero.
  assert.equal(coversCity(rings, ["50001", "50002", "50003"]), false);
  assert.equal(coversCity(rings, []), false);
});

test("cada ciudad publicada cabe en el presupuesto de 80 KB comprimidos", () => {
  if (!existsSync(GEO_DIR)) return;
  const files = readdirSync(GEO_DIR).filter((f) => f.endsWith(".topo.json"));

  for (const file of files) {
    const gz = gzipSync(readFileSync(path.join(GEO_DIR, file))).length;
    assert.ok(
      gz <= CITY_GEOMETRY_BUDGET_GZ,
      `${file} pesa ${(gz / 1024).toFixed(1)} KB gz, por encima del presupuesto de ${CITY_GEOMETRY_BUDGET_GZ / 1024} KB`
    );
  }
});

test("el preproceso está documentado con su quantization, no en la cabeza de alguien", () => {
  const readme = readFileSync(path.join(GEO_DIR, "README.md"), "utf8");
  assert.match(readme, /mapshaper/);
  assert.match(readme, /quantization=1e5/);
  assert.match(readme, /simplify/);
});

test("se sirve por ciudad y nunca se manda una que no se está mirando", () => {
  const route = readFileSync("src/app/api/geo/[ciudad]/route.ts", "utf8");
  // Una ciudad por petición, con revalidación larga.
  assert.match(route, /export const revalidate = 86_400/);
  // Y el slug se vuelve a normalizar antes de tocar disco: sin esto,
  // `/api/geo/..%2F..%2F.env` es una lectura arbitraria.
  assert.match(route, /slug !== ciudad\.toLowerCase\(\)/);

  const map = readFileSync("src/app/(app)/mapa-barrios/barrio-map.tsx", "utf8");
  assert.match(map, /fetch\(`\/api\/geo\/\$\{encodeURIComponent\(cityKey\)\}`\)/);
});

test("la teselación se conserva como respaldo, y la nota dice cuál se usa", () => {
  const map = readFileSync("src/app/(app)/mapa-barrios/barrio-map.tsx", "utf8");
  // El respaldo no se retira: hay ciudades sin geometría publicada, y las habrá
  // durante mucho tiempo.
  assert.match(map, /realRings \? points\.map\(\(p\) => realRings\[p\.code\]\) : tessellate\(points\)/);
  assert.match(map, /onGeometry\?\.\(realRings !== null\)/);

  const view = readFileSync("src/app/(app)/mapa-barrios/barrio-map-view.tsx", "utf8");
  assert.match(view, /geometryNote\(realGeometry\)/);
});
