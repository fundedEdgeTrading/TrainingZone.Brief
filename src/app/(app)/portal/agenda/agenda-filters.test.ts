import test from "node:test";
import assert from "node:assert/strict";
import { filterAgendaSessions, distinctAgendaDays, parseModality } from "./agenda-filters";

/**
 * E5-07 — escenario principal: filtrar por día y por modalidad, y "sin
 * resultados" cuando la combinación no deja ninguna sesión.
 */

type Fake = { occurrenceDate: string; classType: string; date: Date };

const GRUPO_LUNES: Fake = { occurrenceDate: "2026-09-07", classType: "Grupo reducido", date: new Date("2026-09-07T09:00:00Z") };
const GRUPO_MARTES: Fake = { occurrenceDate: "2026-09-08", classType: "Grupo reducido", date: new Date("2026-09-08T09:00:00Z") };
const EP_LUNES: Fake = { occurrenceDate: "2026-09-07", classType: "Personal Training", date: new Date("2026-09-07T18:00:00Z") };

const ALL = [GRUPO_LUNES, GRUPO_MARTES, EP_LUNES];

test("sin filtro, no quita nada", () => {
  assert.deepEqual(filterAgendaSessions(ALL, {}), ALL);
});

test("filtra por día", () => {
  assert.deepEqual(filterAgendaSessions(ALL, { day: "2026-09-07" }), [GRUPO_LUNES, EP_LUNES]);
});

test("filtra por modalidad", () => {
  assert.deepEqual(filterAgendaSessions(ALL, { modality: "EP" }), [EP_LUNES]);
});

test("día + modalidad se aplican en AND", () => {
  assert.deepEqual(filterAgendaSessions(ALL, { day: "2026-09-08", modality: "EP" }), []);
});

test("una combinación sin sesiones deja la lista vacía (sin resultados)", () => {
  assert.equal(filterAgendaSessions(ALL, { day: "2026-09-09" }).length, 0);
});

test("los días distintos salen ordenados por fecha, sin duplicar el mismo día", () => {
  const days = distinctAgendaDays(ALL);
  assert.deepEqual(
    days.map((d) => d.value),
    ["2026-09-07", "2026-09-08"]
  );
});

test("un valor de modalidad desconocido en la URL se ignora en vez de reventar", () => {
  assert.equal(parseModality("cualquier-cosa"), undefined);
  assert.equal(parseModality(undefined), undefined);
  assert.equal(parseModality("GROUP"), "GROUP");
  assert.equal(parseModality("EP"), "EP");
});
