import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DIVERGING_RAMP,
  INK_BONE,
  INK_DARK,
  RAMP_FALLBACK_INK,
  SEQUENTIAL_RAMP,
  contrastRatio,
  haloForInk,
  inksByCode,
  dashedByCode,
  lightness,
  readableInkOn,
  type BarrioStat,
} from "@/lib/barrio-map";

/**
 * E11-06 · Contraste, daltonismo y modo oscuro.
 *
 * Lo llamativo del hallazgo era que `readableMetricInk()` ya resolvía el
 * problema de la tinta y solo se usaba en la tarjeta de foco: las etiquetas del
 * mapa se pintaban con tinta fija y sobre el escalón 6 la cifra daba 1,12:1.
 */

function barrio(over: Partial<BarrioStat> & { code: string }): BarrioStat {
  return {
    name: `Barrio ${over.code}`,
    lat: 41.65,
    lng: -0.88,
    leads: 0,
    members: 0,
    total: 0,
    conv: 0,
    trend: 0,
    dist: 0,
    opp: 0,
    nearestCenter: null,
    ...over,
  };
}

test("la rampa secuencial sigue siendo monótona en claridad: estaba bien y no se toca", () => {
  const ls = SEQUENTIAL_RAMP.map(lightness);
  for (let i = 1; i < ls.length; i++) {
    assert.ok(ls[i] < ls[i - 1], `la rampa secuencial deja de bajar en el escalón ${i}`);
  }
});

test("la divergente: ningún par simétrico con ΔL* menor que 12", () => {
  // Antes eran 1,9 · 4,4 · 0,8, así que lo único que separaba "cae un 40 %" de
  // "sube un 40 %" era el eje rojo-verde — el que pierde el ~8 % de los hombres.
  for (const [a, b] of [
    [0, 6],
    [1, 5],
    [2, 4],
  ]) {
    const delta = Math.abs(lightness(DIVERGING_RAMP[a]) - lightness(DIVERGING_RAMP[b]));
    assert.ok(delta >= 12, `el par (${a},${b}) solo se separa ΔL* ${delta.toFixed(1)}`);
  }
});

test("la divergente sigue teniendo su centro neutro y sus dos brazos", () => {
  assert.equal(DIVERGING_RAMP.length, 7);
  // El centro es el más claro de los siete: es el "sin cambio".
  const centro = lightness(DIVERGING_RAMP[3]);
  for (const [i, color] of DIVERGING_RAMP.entries()) {
    if (i !== 3) assert.ok(lightness(color) < centro, `el escalón ${i} no puede ser más claro que el centro`);
  }
});

test("redundancia no cromática: los barrios que caen llevan trazo discontinuo", () => {
  const points = [barrio({ code: "a", trend: -30 }), barrio({ code: "b", trend: 30 }), barrio({ code: "c", trend: 0 })];
  assert.deepEqual(dashedByCode(points, "trend"), { a: true, b: false, c: false });
  // Solo en la divergente: en las secuenciales no hay signo que marcar.
  assert.deepEqual(dashedByCode(points, "members"), {});
});

test("la tinta del rótulo se elige por contraste, no por costumbre", () => {
  // Escalón más claro → tinta oscura; escalón más oscuro → tinta hueso.
  assert.equal(readableInkOn(SEQUENTIAL_RAMP[0]), INK_DARK);
  assert.equal(readableInkOn(SEQUENTIAL_RAMP[6]), INK_BONE);
  assert.equal(haloForInk(INK_DARK), INK_BONE);
  assert.equal(haloForInk(INK_BONE), INK_DARK);

  // Y sale del MISMO relleno que pinta la celda.
  assert.deepEqual(inksByCode({ a: SEQUENTIAL_RAMP[0], b: SEQUENTIAL_RAMP[6] }), { a: INK_DARK, b: INK_BONE });
});

test("el peor contraste del rótulo sube de 1,12:1 a más de 7:1", () => {
  // Lo que el ojo lee es la tinta contra su halo, que es una superficie cerrada
  // por los cuatro lados y no un desenfoque.
  for (const fill of [...SEQUENTIAL_RAMP, ...DIVERGING_RAMP]) {
    const ink = readableInkOn(fill);
    const ratio = contrastRatio(ink, haloForInk(ink));
    assert.ok(ratio > 7, `sobre ${fill} el rótulo solo llega a ${ratio.toFixed(2)}:1 contra su halo`);
  }

  // Y contra la celda misma, que es lo que se veía antes: la cifra pasaba de
  // 1,12:1 (tinta #5b5748 sobre el escalón 6) a esto.
  const antes = contrastRatio("#5b5748", SEQUENTIAL_RAMP[6]);
  assert.ok(antes < 1.3, `la referencia del informe no se reproduce: ${antes.toFixed(2)}`);
  for (const fill of [...SEQUENTIAL_RAMP, ...DIVERGING_RAMP]) {
    assert.ok(contrastRatio(readableInkOn(fill), fill) > 4.5, `${fill} no llega a 4,5:1 ni con la mejor tinta`);
  }
});

test("RAMP_FALLBACK_INK deja de ser literal y pasa a token", () => {
  // Sobre la tarjeta oscura, `#1d1d1c` daba 1,07:1 — invisible.
  assert.equal(RAMP_FALLBACK_INK, "var(--color-brand-text)");
});

test("en oscuro el mapa de barrios tiene teselas propias y deja de heredar el filtro invertido", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\[data-theme="dark"\] \.tz-barrio-map \.leaflet-tile \{/);
  // El de la tarjeta del panel sí invierte; el del mapa a pantalla completa, no:
  // debajo de una coropleta de rampa fija y clara, invertir deja colores
  // flotando sobre un vacío negro.
  const barrioRule = css.slice(css.indexOf('[data-theme="dark"] .tz-barrio-map .leaflet-tile {'));
  assert.ok(!barrioRule.slice(0, 200).includes("invert("));
});
