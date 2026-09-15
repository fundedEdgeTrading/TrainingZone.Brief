import test from "node:test";
import assert from "node:assert/strict";
import { toCsv } from "@/lib/csv-export";

/**
 * E6-06 · formato español de exportación: punto y coma, BOM y fórmulas
 * neutralizadas — el mismo criterio que ya usaba el export de auditoría, esta
 * vez compartido por socios y cobros en vez de reescrito dos veces más.
 */

test("E6-06 · usa punto y coma como separador", () => {
  const csv = toCsv(["A", "B"], [["1", "2"]]);
  assert.match(csv, /A;B/);
  assert.match(csv, /1;2/);
});

test("E6-06 · lleva BOM para que Excel en español no rompa los acentos", () => {
  const csv = toCsv(["Nombre"], [["Ángela"]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
});

test("E6-06 · neutraliza una celda que empieza como fórmula", () => {
  const csv = toCsv(["Nombre"], [["=HYPERLINK(\"http://evil\")"]]);
  assert.doesNotMatch(csv.replace(/^﻿/, ""), /^"?=/m);
});

test("HU-ST-25 · un número negativo NO se neutraliza: la gestoría tiene que poder sumarlo", () => {
  // Una devolución va en negativo (HU-ST-25). Con el apóstrofo delante, Excel
  // la abre como texto y la columna deja de sumar — el cuadre se rompe sin que
  // nadie vea nada raro. Un número no puede ser una fórmula.
  const csv = toCsv(["NetoEuros"], [["-20,00"], ["-1234.56"], ["47,97"]]);
  assert.doesNotMatch(csv, /'/);
  assert.match(csv, /-20,00/);

  // Lo que sí empieza como fórmula sigue neutralizado, aunque lleve números.
  const formula = toCsv(["Nota"], [["-2+3*A1"]]);
  assert.match(formula, /'-2\+3\*A1/);
});

test("E6-06 · una celda con el separador va entre comillas", () => {
  const csv = toCsv(["Nota"], [["Con; punto y coma"]]);
  assert.match(csv, /"Con; punto y coma"/);
});
