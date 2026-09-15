import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CUSTOM_RANGE_MAX_DAYS,
  DASHBOARD_RANGES,
  comparisonWindow,
  customRangeParams,
  dayBuckets,
  hourBuckets,
  parseCustomRange,
  parseRange,
  rangeMeta,
  revenueBuckets,
  sparkBuckets,
  weekBuckets,
  type DashboardRange,
} from "./dashboard-range";

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
const ALL_RANGES = DASHBOARD_RANGES.map((r) => r.id);
const CUSTOM = { from: new Date(2026, 4, 1), to: new Date(2026, 6, 1) }; // mayo y junio

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

test("comparisonWindow: la regla vale para los SIETE periodos, no solo para los que había", () => {
  // E14-06: comparisonWindow se extiende, no se reescribe. El invariante es
  // uno y se comprueba de golpe: la ventana previa termina donde empieza la
  // actual o antes, nunca dentro, y arranca antes de terminar.
  for (const range of ALL_RANGES) {
    const win = comparisonWindow(range as DashboardRange, AUG_24, CUSTOM);
    assert.ok(win.from < win.to, `${range}: la ventana actual va de menos a más`);
    assert.ok(win.prevFrom < win.prevTo, `${range}: la ventana previa va de menos a más`);
    assert.ok(win.prevTo <= win.from, `${range}: la ventana previa se solapa con la actual`);
    assert.ok(win.deltaHint.startsWith("vs. "), `${range}: el pie del chip dice contra qué compara`);
    assert.ok(win.scopeLabel && win.sessionsScopeLabel && win.prevLabel, `${range}: le falta algún rótulo`);
  }
});

test("comparisonWindow: «hoy» compara contra el mismo tramo de ayer", () => {
  const win = comparisonWindow("dia", AUG_24);
  assert.deepEqual(win.from, new Date(2026, 7, 24));
  assert.deepEqual(win.prevFrom, new Date(2026, 7, 23));
  // 9,5 horas transcurridas: contra las 9,5 primeras horas de ayer, no contra
  // ayer entero, que a las 9:30 sería una caída inventada de las de E14-01.
  assert.deepEqual(win.prevTo, new Date(2026, 7, 23, 9, 30));
  assert.equal(win.prevLabel, "ayer");
});

test("comparisonWindow: «semana» arranca en lunes y compara contra la semana previa", () => {
  const win = comparisonWindow("semana", AUG_24);
  assert.deepEqual(win.from, new Date(2026, 7, 24), "el 24 de agosto de 2026 es lunes");
  assert.deepEqual(win.prevFrom, new Date(2026, 7, 17));
  assert.deepEqual(win.prevTo, new Date(2026, 7, 17, 9, 30));

  // Un domingo pertenece a la semana que empezó el lunes anterior (ISO).
  const sunday = comparisonWindow("semana", new Date(2026, 7, 30, 12, 0));
  assert.deepEqual(sunday.from, new Date(2026, 7, 24));
});

test("comparisonWindow: los periodos móviles comparan contra los N meses justo anteriores", () => {
  const tres = comparisonWindow("3m", AUG_24);
  assert.deepEqual(tres.from, new Date(2026, 4, 24, 9, 30), "3 meses atrás desde el 24 de agosto");
  assert.deepEqual(tres.prevFrom, new Date(2026, 1, 24, 9, 30));
  assert.deepEqual(tres.prevTo, tres.from, "ventana entera transcurrida: sin recorte y sin hueco");

  const seis = comparisonWindow("6m", AUG_24);
  assert.deepEqual(seis.from, new Date(2026, 1, 24, 9, 30));
  assert.deepEqual(seis.prevFrom, new Date(2025, 7, 24, 9, 30));
  assert.deepEqual(seis.prevTo, seis.from);
});

test("comparisonWindow: los meses móviles recortan el día 31 en vez de desbordar al mes siguiente", () => {
  // 31 de mayo menos 3 meses no es el 3 de marzo: es el 28 de febrero.
  const win = comparisonWindow("3m", new Date(2026, 4, 31, 12, 0));
  assert.equal(win.from.getMonth(), 1, "febrero");
  assert.equal(win.from.getDate(), 28);
});

test("comparisonWindow: el año en curso se recorta al tramo transcurrido", () => {
  const ano = comparisonWindow("ano", AUG_24);
  assert.deepEqual(ano.from, new Date(2026, 0, 1));
  assert.deepEqual(ano.prevFrom, new Date(2025, 0, 1));
  assert.ok(ano.prevTo <= ano.from);
});

test("comparisonWindow: el personalizado compara contra el mismo número de días justo antes", () => {
  const win = comparisonWindow("custom", AUG_24, CUSTOM);
  assert.deepEqual(win.from, CUSTOM.from);
  assert.deepEqual(win.to, CUSTOM.to);
  // Mayo (31) + junio (30) = 61 días: el tramo previo son los 61 anteriores.
  assert.deepEqual(win.prevTo, CUSTOM.from);
  assert.equal(Math.round((win.from.getTime() - win.prevFrom.getTime()) / 86_400_000), 61);
  assert.match(win.deltaHint, /61 días justo anteriores/);
});

test("comparisonWindow: «custom» sin fechas válidas cae en el mes en curso y no revienta", () => {
  const win = comparisonWindow("custom", AUG_24);
  assert.deepEqual(win.from, new Date(2026, 7, 1), "se comporta como «mes»");
  assert.equal(win.scopeLabel, "del mes");
});

test("sparkBuckets: siete tramos contiguos que terminan en el actual, sea cual sea el periodo", () => {
  for (const range of ALL_RANGES) {
    const buckets = sparkBuckets(range as DashboardRange, AUG_24, CUSTOM);
    assert.equal(buckets.length, 7, `${range}: la sparkline son siempre siete puntos`);
    for (let i = 1; i < buckets.length; i++) {
      assert.deepEqual(buckets[i].from, buckets[i - 1].to, `${range}: sin huecos entre tramos`);
    }
  }

  const months = sparkBuckets("mes", AUG_24);
  assert.deepEqual(months[6].from, new Date(2026, 7, 1), "el último tramo es el mes en curso");
  assert.deepEqual(months[0].from, new Date(2026, 1, 1), "el primero, seis meses antes");
});

test("sparkBuckets: el tramo natural es la hora en «hoy» y el día en «semana»", () => {
  const hours = sparkBuckets("dia", AUG_24);
  assert.deepEqual(hours[6].from, new Date(2026, 7, 24, 9), "termina en la hora en curso");
  assert.match(hours[6].label, /^09h$/);
  assert.equal(hours[0].label, "03h");

  const days = sparkBuckets("semana", AUG_24);
  assert.deepEqual(days[6].from, new Date(2026, 7, 24), "termina hoy");
  assert.equal(days[6].label, "lun", "dentro de una semana el rótulo es el día de la semana");
});

test("sparkBuckets: el personalizado elige la unidad por su amplitud, no parte la ventana en siete", () => {
  const horas = sparkBuckets("custom", AUG_24, { from: new Date(2026, 7, 20), to: new Date(2026, 7, 21) });
  assert.match(horas[6].label, /h$/, "un día o menos se mira por horas");

  const dias = sparkBuckets("custom", AUG_24, { from: new Date(2026, 7, 1), to: new Date(2026, 7, 21) });
  assert.match(dias[6].label, /^\d{1,2}\/\d{1,2}$/, "tres semanas se miran por días");

  const semanas = sparkBuckets("custom", AUG_24, CUSTOM);
  assert.match(semanas[6].label, /^S\d{1,2}$/, "dos meses se miran por semanas ISO");

  const meses = sparkBuckets("custom", AUG_24, { from: new Date(2024, 8, 1), to: new Date(2026, 7, 1) });
  assert.equal(meses[6].from.getDate(), 1, "dos años se miran por meses");
});

test("revenueBuckets: la unidad del personalizado hace que la serie cubra la ventana entera", () => {
  // La escalera de `customUnit` está puesta para que ninguna ventana válida
  // necesite recorte: si hubiera que recortar, la gráfica dejaría fuera el
  // principio del periodo sin decirlo.
  const ventanas = [
    { from: new Date(2026, 7, 24, 0), to: new Date(2026, 7, 24, 20) }, // 20 horas
    { from: new Date(2026, 7, 1), to: new Date(2026, 7, 24) }, // 23 días
    { from: new Date(2026, 4, 1), to: new Date(2026, 6, 1) }, // dos meses
    { from: new Date(2024, 8, 1), to: new Date(2026, 7, 1) }, // dos años
  ];
  for (const ventana of ventanas) {
    const buckets = revenueBuckets("custom", AUG_24, ventana);
    // 31 tramos de la unidad, más uno de holgura por el desfase de calendario.
    assert.ok(buckets.length <= 32, `${buckets.length} tramos no se leen en una gráfica`);
    assert.ok(buckets[0].from <= ventana.from, "la serie arranca en o antes del principio del periodo");
    assert.ok(buckets[buckets.length - 1].to >= ventana.to, "y termina en o después del final");
  }
});

test("sparkBuckets: el último tramo del personalizado cae DENTRO de la ventana", () => {
  // `to` es exclusivo. Anclar los tramos en `to` metería julio en un periodo
  // que termina el 30 de junio.
  const buckets = sparkBuckets("custom", AUG_24, CUSTOM);
  assert.ok(buckets[6].from < CUSTOM.to, "el último tramo arranca dentro del periodo");
  assert.equal(buckets[6].from.getMonth(), 5, "junio, no julio");
});

test("revenueBuckets: cada periodo trae los tramos que anuncia su rótulo", () => {
  assert.equal(revenueBuckets("mes", AUG_24).length, 6);
  assert.equal(revenueBuckets("ano", AUG_24).length, 10);
  assert.equal(revenueBuckets("3m", AUG_24).length, 3);
  assert.equal(revenueBuckets("6m", AUG_24).length, 6);
  // A las 9:30 van diez horas del día (00h–09h) y el lunes es el primer día.
  assert.equal(revenueBuckets("dia", AUG_24).length, 10);
  assert.equal(revenueBuckets("semana", AUG_24).length, 1);
  assert.equal(revenueBuckets("semana", new Date(2026, 7, 30, 12)).length, 7, "el domingo cierra la semana");
});

test("revenueBuckets: el personalizado no devuelve setecientas barras", () => {
  const dosAnos = { from: new Date(2024, 7, 24), to: new Date(2026, 7, 24) };
  assert.ok(revenueBuckets("custom", AUG_24, dosAnos).length <= 31);
});

test("rangeMeta: el pie de la card de ingresos nombra el periodo elegido", () => {
  assert.equal(rangeMeta("mes"), "últimos 6 meses");
  assert.equal(rangeMeta("3m"), "los 3 meses del periodo");
  // El último día del periodo es el anterior a `to`, que es exclusivo.
  assert.equal(rangeMeta("custom", CUSTOM), "del 1 may al 30 jun");
  assert.equal(rangeMeta("custom"), "últimos 6 meses", "sin fechas se comporta como «mes»");
});

test("weekBuckets: las ocho semanas cerradas del panel de altas y bajas dejan fuera la actual", () => {
  const closed = weekBuckets(9, AUG_24).slice(0, 8);
  assert.equal(closed.length, 8);
  const currentWeekStart = weekBuckets(1, AUG_24)[0].from;
  assert.ok(closed[7].to <= currentWeekStart, "la última semana cerrada termina donde empieza la actual");
});

test("dayBuckets y hourBuckets: contiguos y terminando en el tramo en curso", () => {
  const days = dayBuckets(5, AUG_24);
  assert.deepEqual(days[4].from, new Date(2026, 7, 24));
  assert.deepEqual(days[4].to, new Date(2026, 7, 25));
  for (let i = 1; i < days.length; i++) assert.deepEqual(days[i].from, days[i - 1].to);

  const hours = hourBuckets(3, AUG_24);
  assert.deepEqual(hours[2].from, new Date(2026, 7, 24, 9));
  for (let i = 1; i < hours.length; i++) assert.deepEqual(hours[i].from, hours[i - 1].to);
});

test("dayBuckets: aritmética de calendario, no de milisegundos, en el cambio de hora", () => {
  // El 25 de octubre de 2026 los relojes atrasan: ese día dura 25 horas y
  // restar 86.400.000 ms dejaría los tramos desalineados de la medianoche.
  const days = dayBuckets(3, new Date(2026, 9, 26, 12));
  for (const b of days) {
    assert.equal(b.from.getHours(), 0, "cada tramo arranca a medianoche");
  }
  assert.deepEqual(days[0].from, new Date(2026, 9, 24));
});

test("parseRange: acepta los siete periodos y traduce los enlaces viejos", () => {
  for (const id of ALL_RANGES) assert.equal(parseRange(id), id);
  assert.equal(parseRange(undefined), "mes");
  assert.equal(parseRange("../../etc/passwd"), "mes");
  // Un enlace guardado con el selector de cuatro no puede caer en el periodo
  // por defecto sin decir nada: quien lo abrió esperaba un trimestre.
  assert.equal(parseRange("trim"), "3m");
  assert.equal(parseRange("30d"), "mes");
});

test("parseCustomRange: un periodo válido devuelve la ventana con `to` exclusivo", () => {
  const now = new Date(2026, 7, 24, 9, 30);
  const res = parseCustomRange("2026-05-01", "2026-06-30", now);
  assert.ok(res.ok);
  assert.deepEqual(res.range.from, new Date(2026, 4, 1));
  assert.deepEqual(res.range.to, new Date(2026, 6, 1), "el 30 de junio entero, o sea hasta el 1 de julio");
});

test("parseCustomRange: «hasta hoy» termina ahora y no a medianoche", () => {
  const now = new Date(2026, 7, 24, 9, 30);
  const res = parseCustomRange("2026-08-01", "2026-08-24", now);
  assert.ok(res.ok);
  assert.deepEqual(res.range.to, now, "la ventana significa lo mismo que la de los demás periodos");
});

test("parseCustomRange: rechaza invertido, futuro y de más de dos años, con su motivo", () => {
  const now = new Date(2026, 7, 24, 9, 30);
  const rechazo = (desde?: string, hasta?: string) => {
    const res = parseCustomRange(desde, hasta, now);
    assert.equal(res.ok, false, `${desde}→${hasta} debería rechazarse`);
    assert.ok(!res.ok && res.message.length > 0, "todo rechazo trae un mensaje para la pantalla");
    return res.ok ? null : res.error;
  };

  assert.equal(rechazo("2026-08-24", "2026-08-01"), "invertido");
  assert.equal(rechazo("2026-08-01", "2026-12-31"), "futuro");
  assert.equal(rechazo("2026-08-25", "2026-08-25"), "futuro", "mañana tampoco");
  assert.equal(rechazo("2024-01-01", "2026-08-24"), "amplitud");
  assert.equal(rechazo("2026-08-01", undefined), "incompleto");
  assert.equal(rechazo(undefined, undefined), "incompleto");
  assert.equal(rechazo("01/08/2026", "2026-08-24"), "formato");
  assert.equal(rechazo("2026-02-31", "2026-08-24"), "formato", "un día que no existe no es un día");
  assert.equal(rechazo("../../etc/passwd", "2026-08-24"), "formato");
});

test("parseCustomRange: el tope de amplitud es exactamente dos años, no uno más", () => {
  const now = new Date(2026, 7, 24, 9, 30);
  const justo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - CUSTOM_RANGE_MAX_DAYS + 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  assert.equal(parseCustomRange(iso(justo), "2026-08-23", now).ok, true);
});

test("customRangeParams: la ventana vuelve a las dos fechas con las que viaja en la URL", () => {
  assert.deepEqual(customRangeParams(CUSTOM), { desde: "2026-05-01", hasta: "2026-06-30" });
  // Ida y vuelta: lo que sale de la URL vuelve a la URL igual.
  const res = parseCustomRange("2026-03-05", "2026-04-17", new Date(2026, 7, 24));
  assert.ok(res.ok);
  assert.deepEqual(customRangeParams(res.range), { desde: "2026-03-05", hasta: "2026-04-17" });
});
