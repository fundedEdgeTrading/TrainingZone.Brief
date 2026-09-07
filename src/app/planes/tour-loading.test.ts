import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * E9-08 · ~108 KB de fuente (`tour-screens.tsx` 85.911 bytes + `tour-stage.tsx`
 * 22 KB) colgaban de un componente `"use client"` importado directamente desde
 * la página: había que descargarlos, analizarlos y ejecutarlos ANTES de poder
 * pulsar "Ver planes", en el bloque donde se decide la conversión.
 *
 * Lo que se vigila aquí es que no se vuelva a colgar del camino crítico, y que
 * el póster mantenga la caja exacta de la pieza: cambiar TBT por CLS sería mover
 * el problema, no resolverlo.
 */

const TOUR = readFileSync("src/app/planes/tour.tsx", "utf8");
const LOADER = readFileSync("src/app/planes/tour-stage-loader.tsx", "utf8");
const STAGE = readFileSync("src/app/planes/tour-stage.tsx", "utf8");
const PAGE = readFileSync("src/app/planes/page.tsx", "utf8");

/** Solo las instrucciones: los comentarios explican precisamente lo que ya no se hace. */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("nadie importa tour-stage directamente: se pasa siempre por el loader", () => {
  assert.match(code(TOUR), /from "\.\/tour-stage-loader"/);
  assert.ok(!/from "\.\/tour-stage"/.test(code(TOUR)), "tour.tsx vuelve a arrastrar la animación al primer bundle");
  assert.ok(!/tour-stage"/.test(code(PAGE)));
  assert.ok(!/tour-screens/.test(code(PAGE)));
});

test("la animación se difiere por las dos vías: ssr:false y por intersección", () => {
  const source = code(LOADER);
  assert.match(source, /dynamic\(\(\) => import\("\.\/tour-stage"\), \{ ssr: false \}\)/);
  assert.match(source, /IntersectionObserver/);
});

test("el póster tiene exactamente las mismas dimensiones que la pieza", () => {
  // Si alguien cambia el encuadre en `tour-stage` y no aquí, el relevo mueve la
  // página entera y el TBT ganado se paga en CLS.
  const frameW = /const FRAME_W = (\d+)/.exec(STAGE)?.[1];
  const frameH = /const FRAME_H = (\d+)/.exec(STAGE)?.[1];
  assert.ok(frameW && frameH, "no se encuentran las dimensiones del encuadre en tour-stage");

  const posterRatio = /aspectRatio: "(\d+) \/ (\d+)"/.exec(LOADER);
  assert.ok(posterRatio, "el hueco del loader no declara aspect-ratio");
  assert.deepEqual([posterRatio[1], posterRatio[2]], [frameW, frameH]);
});

test("/planes conserva su force-dynamic y solo el bloque de precios espera en Suspense", () => {
  assert.match(code(PAGE), /export const dynamic = "force-dynamic"/);
  assert.match(code(PAGE), /<Suspense fallback=\{<PricingSkeleton \/>\}>\s*<PricingBlock/);

  // El resto de la página no depende del entorno y no tiene por qué esperar.
  for (const staticBlock of ["<Hero />", "<Tour />", "<Faq />", "<Testimonials />"]) {
    const index = PAGE.indexOf(staticBlock);
    assert.ok(index !== -1, `falta ${staticBlock}`);
    assert.ok(!/<Suspense/.test(PAGE.slice(index - 120, index)), `${staticBlock} no debería estar dentro de un Suspense`);
  }
});
