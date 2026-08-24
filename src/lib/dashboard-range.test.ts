import { test } from "node:test";
import assert from "node:assert/strict";

import { comparisonWindow, parseRange, revenueBuckets, sparkBuckets, weekBuckets } from "./dashboard-range";

/**
 * La aritmética del selector de periodo del panel de dirección.
 *
 * Lo que se prueba aquí es lo que no se ve al mirar la pantalla: que la ventana
 * de comparación no se solape con la actual (de ahí saldrían deltas inventados)
 * y que los tramos de la sparkline sean siete y contiguos. Todo con fechas
 * fijas: una prueba de calendario que dependa de "hoy" solo falla algunos días
 * del mes, que es la peor forma de fallar.
 */

const AUG_24 = new Date(2026, 7, 24, 9, 30); // lunes 24 de agosto de 2026

test("comparisonWindow: el mes en curso se compara contra el mismo tramo del anterior", () => {
  const win = comparisonWindow("mes", AUG_24);
  assert.deepEqual(win.from, new Date(2026, 7, 1));
  assert.deepEqual(win.prevFrom, new Date(2026, 6, 1));
  // 23 días y 9,5 horas transcurridos desde el 1 de agosto: la ventana previa
  // arranca el 1 de julio y cubre exactamente ese mismo tramo, no julio entero.
  assert.equal(win.prevTo.getMonth(), 6);
  assert.equal(win.prevTo.getDate(), 24);
  assert.equal(win.prevLabel, "julio");
  assert.match(win.deltaHint, /^vs\. julio a esta fecha$/);
});

test("comparisonWindow: la ventana previa nunca invade la actual aunque el mes anterior sea más corto", () => {
  // 31 de marzo: 30 días transcurridos. Sumados al 1 de febrero (28 días) se
  // meterían tres días dentro de marzo y esos cobros se contarían dos veces.
  const win = comparisonWindow("mes", new Date(2026, 2, 31, 23, 0));
  assert.ok(win.prevTo <= win.from, "prevTo debe quedar en o antes del arranque del tramo actual");
  assert.deepEqual(win.prevTo, new Date(2026, 2, 1));
});

test("comparisonWindow: 30 días compara contra los 30 previos, sin solape", () => {
  const win = comparisonWindow("30d", AUG_24);
  assert.deepEqual(win.prevTo, win.from);
  assert.equal(Math.round((win.from.getTime() - win.prevFrom.getTime()) / 86_400_000), 30);
});

test("comparisonWindow: trimestre y año se recortan al tramo transcurrido", () => {
  const trim = comparisonWindow("trim", AUG_24);
  assert.deepEqual(trim.from, new Date(2026, 6, 1), "el trimestre en curso arranca en julio");
  assert.deepEqual(trim.prevFrom, new Date(2026, 3, 1), "el anterior, en abril");
  assert.ok(trim.prevTo <= trim.from);

  const ano = comparisonWindow("ano", AUG_24);
  assert.deepEqual(ano.from, new Date(2026, 0, 1));
  assert.deepEqual(ano.prevFrom, new Date(2025, 0, 1));
  assert.ok(ano.prevTo <= ano.from);
});

test("sparkBuckets: siete tramos contiguos que terminan en el actual", () => {
  const months = sparkBuckets("mes", AUG_24);
  assert.equal(months.length, 7);
  assert.deepEqual(months[6].from, new Date(2026, 7, 1), "el último tramo es el mes en curso");
  assert.deepEqual(months[0].from, new Date(2026, 1, 1), "el primero, seis meses antes");
  for (let i = 1; i < months.length; i++) {
    assert.deepEqual(months[i].from, months[i - 1].to, "sin huecos entre tramos");
  }

  const weeks = sparkBuckets("30d", AUG_24);
  assert.equal(weeks.length, 7);
  assert.equal(weeks[6].from.getDay(), 1, "las semanas arrancan en lunes");
  assert.match(weeks[6].label, /^S\d{1,2}$/);
});

test("revenueBuckets: cada periodo trae los tramos que anuncia su rótulo", () => {
  assert.equal(revenueBuckets("mes", AUG_24).length, 6);
  assert.equal(revenueBuckets("30d", AUG_24).length, 4);
  assert.equal(revenueBuckets("ano", AUG_24).length, 10);
  // Agosto es el segundo mes del trimestre julio-septiembre: dos tramos, no tres.
  assert.equal(revenueBuckets("trim", AUG_24).length, 2);
  assert.equal(revenueBuckets("trim", new Date(2026, 6, 5)).length, 1);
  assert.equal(revenueBuckets("trim", new Date(2026, 8, 30)).length, 3);
});

test("weekBuckets: las ocho semanas cerradas del panel de altas y bajas dejan fuera la actual", () => {
  const closed = weekBuckets(9, AUG_24).slice(0, 8);
  assert.equal(closed.length, 8);
  const currentWeekStart = weekBuckets(1, AUG_24)[0].from;
  assert.ok(closed[7].to <= currentWeekStart, "la última semana cerrada termina donde empieza la actual");
});

test("parseRange: solo acepta los cuatro periodos, el resto cae en el de por defecto", () => {
  assert.equal(parseRange("trim"), "trim");
  assert.equal(parseRange("30d"), "30d");
  assert.equal(parseRange(undefined), "mes");
  assert.equal(parseRange("../../etc/passwd"), "mes");
});
