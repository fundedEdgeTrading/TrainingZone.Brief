import test from "node:test";
import assert from "node:assert/strict";
import { noShowPct, occupancyByWeekday, occupancyPct, occurrencesOf, type OccupancySession } from "@/lib/occupancy";

/**
 * E12-06: la ocupación y el no-show del panel se cuentan por OCURRENCIA.
 *
 * `dashboard-queries.ts` filtraba por `ClassSession.date` —la fecha base de la
 * serie— y contaba las reservas de la fila entera sin acotar por
 * `occurrenceDate`, mientras el resto de la aplicación usa `expandOccurrences`.
 */

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Una serie semanal de 8 semanas con aforo 10, empezando el lunes indicado. */
function weeklySeries(startISO: string, weeks: number, capacity: number, attendedPerWeek: number): OccupancySession {
  const start = day(startISO);
  const bookings: { status: string; occurrenceDate: Date }[] = [];
  for (let w = 0; w < weeks; w++) {
    const occurrence = new Date(start);
    occurrence.setDate(occurrence.getDate() + w * 7);
    for (let i = 0; i < attendedPerWeek; i++) bookings.push({ status: "ATTENDED", occurrenceDate: occurrence });
  }
  const recUntil = new Date(start);
  recUntil.setDate(recUntil.getDate() + (weeks - 1) * 7);
  return { date: start, recurrence: "WEEKLY", recUntil, capacity, bookings };
}

test("serie recurrente: la ocupación se calcula por ocurrencia dentro de la ventana", () => {
  // 8 semanas, aforo 10, 5 asistentes cada semana → 50 %.
  const serie = weeklySeries("2026-07-06", 8, 10, 5);
  const occurrences = occurrencesOf([serie], day("2026-07-06"), day("2026-08-31"));

  assert.equal(occurrences.length, 8, "ocho ocurrencias, no una fila");
  assert.equal(occupancyPct(occurrences), 50);
});

test("serie antigua: cuenta sus ocurrencias dentro de la ventana aunque la base quede fuera", () => {
  // Creada hace medio año y todavía viva. Con el filtro por `date` no contaba
  // NUNCA; ahora aporta las clases de la ventana.
  const serie = weeklySeries("2026-03-02", 40, 10, 6);
  const occurrences = occurrencesOf([serie], day("2026-08-03"), day("2026-08-31"));

  assert.equal(occurrences.length, 4, "las cuatro semanas de agosto");
  assert.equal(occupancyPct(occurrences), 60);
});

test("la ocupación nunca supera el 100 %", () => {
  // El fallo verificado: la fila aportaba su aforo UNA vez y TODAS sus reservas
  // históricas. Contando por ocurrencia, cada día se mide contra su aforo.
  const serie = weeklySeries("2026-07-06", 8, 10, 10);
  const occurrences = occurrencesOf([serie], day("2026-07-06"), day("2026-08-31"));
  assert.equal(occupancyPct(occurrences), 100);

  // Y una ocurrencia sobrevendida (aforo bajado después de reservar) tampoco
  // arrastra el total por encima del tope.
  const oversold: OccupancySession = {
    date: day("2026-07-06"),
    recurrence: "NONE",
    recUntil: null,
    capacity: 4,
    bookings: Array.from({ length: 7 }, () => ({ status: "ATTENDED", occurrenceDate: day("2026-07-06") })),
  };
  assert.equal(occupancyPct(occurrencesOf([oversold], day("2026-07-01"), day("2026-07-31"))), 100);
});

test("una serie de lunes a viernes se imputa a los cinco días, no a uno", () => {
  const weekdays: OccupancySession = {
    date: day("2026-07-06"), // lunes
    recurrence: "WEEKDAYS",
    recUntil: day("2026-07-10"), // viernes
    capacity: 10,
    bookings: [],
  };
  const occurrences = occurrencesOf([weekdays], day("2026-07-06"), day("2026-07-13"));
  assert.equal(occurrences.length, 5);

  const pcts = occupancyByWeekday(occurrences);
  // Con la fecha base, las cinco clases cargaban en el lunes y el resto salía a
  // 0. Ahora hay aforo repartido de lunes (1) a viernes (5).
  const withCapacity = occurrences.map((o) => o.date.getDay()).sort();
  assert.deepEqual(withCapacity, [1, 2, 3, 4, 5]);
  assert.equal(pcts.length, 7);
  assert.equal(pcts[0], 0, "domingo sigue sin clases");
  assert.equal(pcts[6], 0, "sábado tampoco");
});

test("el no-show se calcula sobre las mismas ocurrencias que la ocupación", () => {
  const start = day("2026-07-06");
  const second = new Date(start);
  second.setDate(second.getDate() + 7);
  const serie: OccupancySession = {
    date: start,
    recurrence: "WEEKLY",
    recUntil: second,
    capacity: 10,
    bookings: [
      { status: "ATTENDED", occurrenceDate: start },
      { status: "ATTENDED", occurrenceDate: start },
      { status: "ATTENDED", occurrenceDate: start },
      { status: "NO_SHOW", occurrenceDate: start },
      { status: "ATTENDED", occurrenceDate: second },
      { status: "NO_SHOW", occurrenceDate: second },
    ],
  };

  const both = occurrencesOf([serie], start, day("2026-07-20"));
  assert.equal(noShowPct(both), 33, "2 faltas de 6 sesiones consumidas");

  // Y acotando la ventana a la primera semana solo entran las de ese día.
  const onlyFirst = occurrencesOf([serie], start, day("2026-07-13"));
  assert.equal(onlyFirst.length, 1);
  assert.equal(noShowPct(onlyFirst), 25, "1 de 4");
});

test("sin ocurrencias en la ventana, los porcentajes son 0 y no un NaN", () => {
  assert.equal(occupancyPct([]), 0);
  assert.equal(noShowPct([]), 0);
  assert.deepEqual(occupancyByWeekday([]), [0, 0, 0, 0, 0, 0, 0]);
});
