import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { cartoTileUrl } from "@/lib/basemap";

/**
 * Teselas de CARTO con clave.
 *
 * Sin `?key=` CARTO sirve el callejero con una marca de agua «API KEY
 * REQUIRED» encima de todo el mapa. La clave llega por
 * `NEXT_PUBLIC_CARTO_BASEMAPS_KEY` y la pone `cartoTileUrl()`, que es el único
 * sitio que construye estas URLs.
 */

function withKey<T>(value: string | undefined, run: () => T): T {
  const before = process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY;
  if (value === undefined) delete process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY;
  else process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY = value;
  try {
    return run();
  } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY;
    else process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY = before;
  }
}

test("con clave, cada tesela la lleva en `?key=`", () => {
  const url = withKey("abc123", () => cartoTileUrl("light_nolabels"));
  assert.equal(url, "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=abc123");
});

test("sin clave (o en blanco) la URL es la de siempre: el mapa sigue funcionando", () => {
  const plain = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  assert.equal(withKey(undefined, () => cartoTileUrl("light_all")), plain);
  assert.equal(withKey("   ", () => cartoTileUrl("light_all")), plain);
});

test("la clave se codifica: un carácter raro no rompe la plantilla de Leaflet", () => {
  const url = withKey("a b&c", () => cartoTileUrl("light_only_labels"));
  assert.ok(url.endsWith("?key=a%20b%26c"), url);
});

test("ningún mapa escribe a mano una URL de teselas de CARTO", () => {
  // Una URL escrita a mano se salta la clave y vuelve a salir con marca de agua.
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) && !file.endsWith(path.join("lib", "basemap.ts"))) {
        if (/basemaps\.cartocdn\.com\/[a-z_]+\/\{z\}/.test(readFileSync(file, "utf8"))) offenders.push(file);
      }
    }
  };
  walk("src");
  assert.deepEqual(offenders, [], `usa cartoTileUrl() en: ${offenders.join(", ")}`);
});

test("la variable está documentada en .env.example y declarada en render.yaml", () => {
  assert.match(readFileSync(".env.example", "utf8"), /^NEXT_PUBLIC_CARTO_BASEMAPS_KEY=/m);
  const render = readFileSync("render.yaml", "utf8");
  // Una vez por servicio web: producción y staging.
  assert.equal(render.match(/- key: NEXT_PUBLIC_CARTO_BASEMAPS_KEY/g)?.length, 2);
});
