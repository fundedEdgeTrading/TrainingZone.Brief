import test from "node:test";
import assert from "node:assert/strict";
import {
  attendancePct,
  heldOccurrences,
  noShowPct,
  ofKind,
  occurrencesOf,
  soldByWeekday,
  soldPct,
  unresolvedRosters,
  type OccupancySession,
} from "@/lib/occupancy";

/**
 * E12-06: la ocupación y el no-show del panel se cuentan por OCURRENCIA.
 *
 * `dashboard-queries.ts` filtraba por `ClassSession.date` —la fecha base de la
 * serie— y contaba las reservas de la fila entera sin acotar por
 * `occurrenceDate`, mientras el resto de la aplicación usa `expandOccurrences`.
 *
 * E14-02: y son DOS métricas. Plazas vendidas contesta "¿estoy llenando?" y
 * asistencia real contesta "¿viene quien reservó?". Lo que había era una sola
 * cifra que contestaba mal a las dos.
 */

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Un instante muy posterior a las fechas de estas pruebas: todo está ya celebrado. */
const DESPUES = day("2027-01-01");

const GROUP = { endTime: "20:00", classType: "Grupo reducido" } as const;

/** Una serie semanal con aforo 10, empezando el lunes indicado. */
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
  return { date: start, recurrence: "WEEKLY", recUntil, capacity, bookings, ...GROUP };
}

test("serie recurrente: la ocupación se calcula por ocurrencia dentro de la ventana", () => {
  // 8 semanas, aforo 10, 5 asistentes cada semana → 50 % de plazas vendidas.
  const serie = weeklySeries("2026-07-06", 8, 10, 5);
  const occurrences = occurrencesOf([serie], day("2026-07-06"), day("2026-08-31"));

  assert.equal(occurrences.length, 8, "ocho ocurrencias, no una fila");
  assert.equal(soldPct(occurrences), 50);
});

test("serie antigua: cuenta sus ocurrencias dentro de la ventana aunque la base quede fuera", () => {
  // Creada hace medio año y todavía viva. Con el filtro por `date` no contaba
  // NUNCA; ahora aporta las clases de la ventana.
  const serie = weeklySeries("2026-03-02", 40, 10, 6);
  const occurrences = occurrencesOf([serie], day("2026-08-03"), day("2026-08-31"));

  assert.equal(occurrences.length, 4, "las cuatro semanas de agosto");
  assert.equal(soldPct(occurrences), 60);
});

test("las plazas vendidas nunca superan el 100 %", () => {
  // El fallo verificado: la fila aportaba su aforo UNA vez y TODAS sus reservas
  // históricas. Contando por ocurrencia, cada día se mide contra su aforo.
  const serie = weeklySeries("2026-07-06", 8, 10, 10);
  assert.equal(soldPct(occurrencesOf([serie], day("2026-07-06"), day("2026-08-31"))), 100);

  // Y una ocurrencia sobrevendida (aforo bajado después de reservar) tampoco
  // arrastra el total por encima del tope.
  const oversold: OccupancySession = {
    date: day("2026-07-06"),
    recurrence: "NONE",
    recUntil: null,
    capacity: 4,
    bookings: Array.from({ length: 7 }, () => ({ status: "ATTENDED", occurrenceDate: day("2026-07-06") })),
    ...GROUP,
  };
  assert.equal(soldPct(occurrencesOf([oversold], day("2026-07-01"), day("2026-07-31"))), 100);
});

test("una serie de lunes a viernes se imputa a los cinco días, no a uno", () => {
  const weekdays: OccupancySession = {
    date: day("2026-07-06"), // lunes
    recurrence: "WEEKDAYS",
    recUntil: day("2026-07-10"), // viernes
    capacity: 10,
    bookings: [],
    ...GROUP,
  };
  const occurrences = occurrencesOf([weekdays], day("2026-07-06"), day("2026-07-13"));
  assert.equal(occurrences.length, 5);

  const pcts = soldByWeekday(occurrences);
  // Con la fecha base, las cinco clases cargaban en el lunes y el resto salía a
  // 0. Ahora hay aforo repartido de lunes (1) a viernes (5).
  const withCapacity = occurrences.map((o) => o.date.getDay()).sort();
  assert.deepEqual(withCapacity, [1, 2, 3, 4, 5]);
  assert.equal(pcts.length, 7);
  assert.equal(pcts[0], 0, "domingo sigue sin clases");
  assert.equal(pcts[6], 0, "sábado tampoco");
});

test("el no-show se calcula sobre las mismas ocurrencias que la asistencia", () => {
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
    ...GROUP,
  };

  const both = occurrencesOf([serie], start, day("2026-07-20"));
  assert.equal(noShowPct(both, DESPUES), 33, "2 faltas de 6 sesiones consumidas");

  // Y acotando la ventana a la primera semana solo entran las de ese día.
  const onlyFirst = occurrencesOf([serie], start, day("2026-07-13"));
  assert.equal(onlyFirst.length, 1);
  assert.equal(noShowPct(onlyFirst, DESPUES), 25, "1 de 4");
});

test("sin ocurrencias en la ventana, los porcentajes son 0 y no un NaN", () => {
  assert.equal(soldPct([]), 0);
  assert.equal(attendancePct([], DESPUES), 0);
  assert.equal(noShowPct([], DESPUES), 0);
  assert.deepEqual(soldByWeekday([]), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(unresolvedRosters([], DESPUES), { occurrences: 0, bookings: 0, total: 0 });
});

// ---------- E14-02 · las dos métricas ----------

/** Una clase suelta con el reparto de reservas que se le pida. */
function single(
  iso: string,
  capacity: number,
  counts: { attended?: number; noShow?: number; booked?: number },
  overrides: Partial<OccupancySession> = {}
): OccupancySession {
  const date = day(iso);
  const bookings: { status: string; occurrenceDate: Date }[] = [];
  const push = (status: string, n = 0) => {
    for (let i = 0; i < n; i++) bookings.push({ status, occurrenceDate: date });
  };
  push("ATTENDED", counts.attended);
  push("NO_SHOW", counts.noShow);
  push("BOOKED", counts.booked);
  return { date, recurrence: "NONE", recUntil: null, capacity, bookings, ...GROUP, ...overrides };
}

test("plazas vendidas y asistencia real contestan preguntas distintas sobre la misma clase", () => {
  // Grupo de 10 con 4 reservas: vienen 3, falta 1. Está medio vacío (40 %)
  // pero vino casi todo el que reservó (75 %). Una sola cifra no puede decir
  // las dos cosas, y el número que había decía 40 % llamándose "ocupación".
  const occurrences = occurrencesOf(
    [single("2026-07-06", 10, { attended: 3, noShow: 1 })],
    day("2026-07-01"),
    day("2026-07-31")
  );
  assert.equal(soldPct(occurrences), 40, "4 plazas vendidas de 10");
  assert.equal(attendancePct(occurrences, DESPUES), 75, "3 asistencias de 4 vendidas");
});

test("una clase que todavía no se ha dado cuenta como vendida y NO hunde la asistencia", () => {
  // El fallo de E14-01: la agenda de esta tarde entraba en el denominador de la
  // asistencia con su aforo entero y cero asistencias.
  const tarde = day("2026-07-06");
  tarde.setHours(19, 0, 0, 0); // la clase de las 19:00-20:00 aún no ha terminado

  const occurrences = occurrencesOf(
    [
      single("2026-07-06", 10, { attended: 5 }, { endTime: "10:00" }), // la de la mañana, ya dada
      single("2026-07-06", 10, { booked: 8 }, { endTime: "20:00" }), // la de la tarde, llena y sin dar
    ],
    day("2026-07-01"),
    day("2026-07-31")
  );

  assert.equal(soldPct(occurrences), 65, "5 + 8 plazas vendidas de 20: la de la tarde SÍ está vendida");
  assert.equal(heldOccurrences(occurrences, tarde).length, 1, "solo la de la mañana se ha celebrado");
  assert.equal(attendancePct(occurrences, tarde), 100, "de lo vendido en la clase ya dada, vino todo el mundo");

  // Con la fórmula vieja —consumidas sobre aforo, sin filtrar celebradas— esto
  // habría dado 25 %: la clase llena de la tarde restando.
});

test("un roster sin pasar lista no se cuenta como asistencia: se cuenta aparte", () => {
  const occurrences = occurrencesOf(
    [
      single("2026-07-06", 10, { attended: 4 }),
      single("2026-07-07", 10, { booked: 6 }), // se celebró y nadie pasó lista
    ],
    day("2026-07-01"),
    day("2026-07-31")
  );

  assert.equal(soldPct(occurrences), 50, "10 plazas vendidas de 20");
  // Meter BOOKED en el numerador daría 100 %. La asistencia real es 4 de 10:
  // las 6 sin resolver están en el denominador porque se vendieron, y fuera del
  // numerador porque nadie sabe si vinieron.
  assert.equal(attendancePct(occurrences, DESPUES), 40);

  const sinResolver = unresolvedRosters(occurrences, DESPUES);
  assert.deepEqual(sinResolver, { occurrences: 1, bookings: 6, total: 2 });
});

test("EP y grupo no se promedian: son dos negocios con aforos incomparables", () => {
  const occurrences = occurrencesOf(
    [
      single("2026-07-06", 10, { attended: 1 }), // grupo al 10 %
      single("2026-07-06", 1, { attended: 1 }, { classType: "Personal Training" }), // EP lleno
      single("2026-07-07", 1, { attended: 1 }, { classType: "Personal Training" }),
    ],
    day("2026-07-01"),
    day("2026-07-31")
  );

  assert.equal(ofKind(occurrences, "GROUP").length, 1);
  assert.equal(ofKind(occurrences, "EP").length, 2);
  assert.equal(soldPct(ofKind(occurrences, "GROUP")), 10);
  assert.equal(soldPct(ofKind(occurrences, "EP")), 100);
  // Y la media de todo junto —lo que se pintaba— no describe ninguno de los dos.
  assert.equal(soldPct(occurrences), 25);
});

test("la asistencia se mide contra lo vendido, no contra el aforo", () => {
  // Dos clases idénticas en asistencia (todo el que reservó vino) y muy
  // distintas en llenado. La asistencia tiene que ser 100 % en las dos.
  const llena = occurrencesOf([single("2026-07-06", 10, { attended: 10 })], day("2026-07-01"), day("2026-07-31"));
  const vacia = occurrencesOf([single("2026-07-07", 10, { attended: 2 })], day("2026-07-01"), day("2026-07-31"));

  assert.equal(attendancePct(llena, DESPUES), 100);
  assert.equal(attendancePct(vacia, DESPUES), 100);
  assert.equal(soldPct(llena), 100);
  assert.equal(soldPct(vacia), 20, "lo vacía que estaba lo dice la otra métrica");
});

test("una hora de fin mal formada no tumba el cálculo: la clase cuenta al acabar el día", () => {
  const occurrences = occurrencesOf(
    [single("2026-07-06", 10, { attended: 5 }, { endTime: "" })],
    day("2026-07-01"),
    day("2026-07-31")
  );
  assert.equal(heldOccurrences(occurrences, day("2026-07-06")).length, 0, "ese mismo día a las 00:00 aún no");
  assert.equal(heldOccurrences(occurrences, day("2026-07-07")).length, 1, "al día siguiente sí");
});
