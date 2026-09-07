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

test("E6-06 · una celda con el separador va entre comillas", () => {
  const csv = toCsv(["Nota"], [["Con; punto y coma"]]);
  assert.match(csv, /"Con; punto y coma"/);
});
