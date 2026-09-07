import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * E11-10 · Movimiento reducido, objetivos táctiles y puntero grueso.
 *
 * Son cuatro fallos que no se ven en una captura y sí en la sala: el mapa vuela
 * cuando se le ha pedido que no, los botones no se dejan tocar, el barrio se
 * queda señalado para siempre en cuanto se usa un dedo, y la única forma de
 * saber qué mide una celda es una tarjeta que bajo 1024 px no existe.
 */

const MAP = readFileSync("src/app/(app)/mapa-barrios/barrio-map.tsx", "utf8");
const VIEW = readFileSync("src/app/(app)/mapa-barrios/barrio-map-view.tsx", "utf8");
const TABLE = readFileSync("src/app/(app)/mapa-barrios/barrio-table.tsx", "utf8");

/** Solo las instrucciones: los comentarios nombran justamente lo que ya no se hace. */
function code(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

test("con prefers-reduced-motion se usa setView con animate:false, no panTo", () => {
  const source = code(MAP);
  // El bloque de globals.css anula las animaciones CSS; `panTo` y `flyTo` son
  // animación JS de Leaflet y seguían ejecutándose enteras.
  assert.match(source, /prefersReducedMotion\(\)/);
  assert.match(source, /setView\(\[point\.lat, point\.lng\], map\.getZoom\(\), \{ animate: false \}\)/);
  assert.match(source, /matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)/);

  // Y el encuadre ya iba sin animar: se comprueba para que no vuelva.
  assert.match(source, /fitBounds\(bounds, \{\s*animate: false/);
});

test("la preferencia se consulta en cada uso, no una vez al montar", () => {
  // Se puede cambiar con la pestaña abierta.
  assert.ok(!/const reduced = prefersReducedMotion\(\)/.test(code(MAP)));
});

test("con pointer:coarse solo el click conmuta el foco", () => {
  const source = code(MAP);
  assert.match(source, /isCoarsePointer\(\)/);
  assert.match(source, /matchMedia\?\.\("\(pointer: coarse\)"\)/);
  // `mouseout` no llega nunca en táctil: los manejadores de ratón solo se
  // cuelgan con puntero fino.
  assert.match(source, /if \(!isCoarsePointer\(\)\) \{\s*cell\.on\("mouseover"/);
});

test("un segundo toque sobre el mismo barrio lo desenfoca", () => {
  // En táctil es la única salida: no hay `mouseout` que deshaga el foco.
  assert.match(code(VIEW), /if \(code === focus\) \{\s*setFocus\(null\)/);
});

test("el polígono lleva su propio tooltip, para no depender de la tarjeta de foco", () => {
  const source = code(MAP);
  assert.match(source, /cell\.bindTooltip\(/);
  // Y se actualiza al cambiar de métrica: si no, seguiría contando la anterior.
  assert.match(source, /setTooltipContent\(/);
});

test("métricas, botones de ciudad y MapButton alcanzan 44 px", () => {
  // Medían ≈35, ≈31 y ≈34, todos por debajo del objetivo táctil mínimo, en la
  // pantalla que más se mira desde una tableta en la sala.
  const withTarget = [...VIEW.matchAll(/min-h-\[44px\]/g)];
  assert.ok(withTarget.length >= 5, `solo ${withTarget.length} controles llegan a 44 px`);

  // Ninguno de los tres conserva el alto viejo.
  assert.ok(!VIEW.includes('px-[15px] py-[9px] rounded-[10px]'), "las pastillas de métrica siguen a 35 px");
  assert.ok(!VIEW.includes('px-4 py-[7px] rounded-full'), "los botones de ciudad siguen a 31 px");

  // Y la tabla nació ya con el objetivo puesto.
  assert.match(TABLE, /min-h-\[44px\]/);
});

test("layoutLabels sigue midiendo las tarjetas en vivo, así que crecer no lo rompe", () => {
  // Las cajas cambian de tamaño con esta historia (botones más altos) y con
  // E11-04 (panel nuevo). El colocador lee los rectángulos reales en cada
  // repintado en vez de tener constantes, así que se adapta solo.
  assert.match(code(MAP), /querySelectorAll\("\[data-tz-overlay\]"\)/);
  assert.match(code(MAP), /getBoundingClientRect\(\)/);
  // El panel nuevo participa en las colisiones.
  assert.match(VIEW, /data-tz-overlay\s+hidden=\{!panelOpen\}/);
});
