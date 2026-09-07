import test from "node:test";
import assert from "node:assert/strict";
import {
  approvalBlocker,
  currentWeekLabel,
  currentWeekOf,
  effectiveStartDate,
  phasesWithoutProgression,
  type SchedulablePhase,
} from "@/lib/mesocycle-schedule";

/**
 * E3-12 · El mesociclo gana `startDate`, semana en curso y descarga declarada.
 *
 * Sin fecha de inicio, "semana 3" no se puede situar en el calendario y la hoja
 * de ruta no le dice nada a quien la lee. Y sin descarga, sin RIR/RPE objetivo y
 * sin progresión semana a semana, cada fase describe "la semana tipo": una fase
 * de 4 semanas es cuatro veces la misma semana.
 */

function phase(over: Partial<SchedulablePhase> = {}): SchedulablePhase {
  return { name: "Acumulación", weekFrom: 1, weekTo: 4, deload: false, notes: null, ...over };
}

const PLAN: SchedulablePhase[] = [
  phase({ name: "Acumulación", weekFrom: 1, weekTo: 3 }),
  phase({ name: "Descarga", weekFrom: 4, weekTo: 4, deload: true }),
  phase({ name: "Intensificación", weekFrom: 5, weekTo: 8, notes: "RIR 3→1, +2,5 kg por semana" }),
];

test("E3-12 · la ficha sabe en qué semana del plan está el socio hoy", () => {
  const start = new Date(2026, 8, 7); // lunes 7 de septiembre
  const current = currentWeekOf({ startDate: start, approvedAt: null }, PLAN, new Date(2026, 8, 23));

  assert.equal(current?.week, 3, "16 días después: tercera semana");
  assert.equal(current?.totalWeeks, 8);
  assert.equal(current?.phaseName, "Acumulación");
  assert.equal(current?.estimatedStart, false);
  assert.equal(currentWeekLabel(current), "Semana 3 de 8 · Acumulación");
});

test("E3-12 · la semana de descarga se anuncia como tal", () => {
  const current = currentWeekOf({ startDate: new Date(2026, 8, 7), approvedAt: null }, PLAN, new Date(2026, 8, 28));
  assert.equal(current?.week, 4);
  assert.equal(current?.deload, true);
  assert.equal(currentWeekLabel(current), "Semana 4 de 8 · Descarga · descarga");
});

test("E3-12 · a los mesociclos existentes se les deduce el inicio, MARCADO como estimado", () => {
  const aprobado = { startDate: null, approvedAt: new Date(2026, 8, 7) };
  assert.deepEqual(effectiveStartDate(aprobado), { date: new Date(2026, 8, 7), estimated: true });

  const current = currentWeekOf(aprobado, PLAN, new Date(2026, 8, 23));
  assert.equal(current?.estimatedStart, true);
  assert.match(currentWeekLabel(current), /\(inicio estimado\)/);

  // Una fecha declarada NO se confunde con una deducida.
  assert.deepEqual(effectiveStartDate({ startDate: new Date(2026, 8, 1), approvedAt: new Date(2026, 8, 7) }), {
    date: new Date(2026, 8, 1),
    estimated: false,
  });
});

test("E3-12 · sin fecha ni aprobación no hay semana que inventar", () => {
  assert.equal(currentWeekOf({ startDate: null, approvedAt: null }, PLAN), null);
  // Y un plan que aún no ha empezado tampoco está en la semana 1.
  assert.equal(
    currentWeekOf({ startDate: new Date(2026, 9, 1), approvedAt: null }, PLAN, new Date(2026, 8, 20)),
    null
  );
});

test("E3-12 · aprobar sin fecha de inicio se rechaza con el motivo", () => {
  const blocker = approvalBlocker({ startDate: null }, PLAN);
  assert.match(blocker ?? "", /fecha de inicio/i);
});

test("E3-12 · una fase larga sin descarga ni progresión declarada bloquea la aprobación", () => {
  const plana: SchedulablePhase[] = [phase({ name: "Bloque único", weekFrom: 1, weekTo: 8 })];

  assert.deepEqual(phasesWithoutProgression(plana).map((p) => p.name), ["Bloque único"]);
  const blocker = approvalBlocker({ startDate: new Date() }, plana);
  assert.match(blocker ?? "", /«Bloque único» \(8 semanas\)/);

  // Con la progresión escrita, o siendo una descarga, deja de bloquear.
  assert.equal(approvalBlocker({ startDate: new Date() }, [phase({ weekFrom: 1, weekTo: 8, notes: "RIR 3→1" })]), null);
  assert.equal(approvalBlocker({ startDate: new Date() }, [phase({ weekFrom: 1, weekTo: 8, deload: true })]), null);
});

test("E3-12 · una fase de tres semanas o menos no exige nada", () => {
  assert.equal(approvalBlocker({ startDate: new Date() }, [phase({ weekFrom: 1, weekTo: 3 })]), null);
  assert.equal(approvalBlocker({ startDate: new Date() }, PLAN), null);
});
