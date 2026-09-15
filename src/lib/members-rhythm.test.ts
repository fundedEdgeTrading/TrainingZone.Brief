import test from "node:test";
import assert from "node:assert/strict";

import { FREQUENCY_WINDOW_WEEKS, memberRhythm } from "@/lib/members-queries";

/**
 * E14-09 · La frecuencia semanal del listado. Aritmética pura: lo único que hace
 * falta probar es el divisor, que es donde está el error caro — el socio recién
 * dado de alta que se cuela el primero en «menos frecuencia».
 */

const NOW = new Date("2026-09-15T12:00:00.000Z");
const WEEK_MS = 7 * 86_400_000;

function weeksAgo(weeks: number): Date {
  return new Date(NOW.getTime() - weeks * WEEK_MS);
}

test("E14-09 · el socio veterano se divide entre la ventana declarada", () => {
  const r = memberRhythm(16, weeksAgo(52), NOW);
  assert.equal(r.weeks, FREQUENCY_WINDOW_WEEKS);
  assert.equal(r.perWeek, 2, "16 sesiones en 8 semanas son 2 por semana");
});

test("E14-09 · el socio recién dado de alta se divide entre lo que lleva dentro", () => {
  // Tres semanas de socio, seis sesiones: su ritmo es 2/sem, no 0,8/sem.
  const r = memberRhythm(6, weeksAgo(3), NOW);
  assert.equal(r.weeks, 3);
  assert.equal(r.perWeek, 2);
});

test("E14-09 · quien acaba de entrar y todavía no ha venido no encabeza la lista de a quién llamar", () => {
  const recien = memberRhythm(0, weeksAgo(0.3), NOW);
  const abandonado = memberRhythm(0, weeksAgo(40), NOW);
  assert.equal(recien.perWeek, 0);
  assert.equal(abandonado.perWeek, 0);
  // Los dos dan 0/sem, y es correcto: lo que los separa en pantalla es la
  // ventana, que por eso viaja con la cifra.
  assert.equal(recien.weeks, 1, "suelo de una semana: tres días no disparan el cociente");
  assert.equal(abandonado.weeks, FREQUENCY_WINDOW_WEEKS);
});

test("E14-09 · sin el suelo de una semana, dos días de socio darían un ritmo inventado", () => {
  const r = memberRhythm(2, weeksAgo(0.28), NOW); // ~2 días
  assert.equal(r.perWeek, 2, "2 sesiones / 1 semana, no 2 / 0,28 = 7,1");
});

test("E14-09 · se redondea a un decimal, que es lo que cabe en la celda", () => {
  assert.equal(memberRhythm(10, weeksAgo(52), NOW).perWeek, 1.3);
  assert.equal(memberRhythm(5, weeksAgo(52), NOW).perWeek, 0.6);
});

test("E14-09 · el orden ascendente es «quién ha bajado el ritmo»", () => {
  const rows = [
    { id: "constante", r: memberRhythm(24, weeksAgo(30), NOW) },
    { id: "apagado", r: memberRhythm(1, weeksAgo(30), NOW) },
    { id: "medio", r: memberRhythm(8, weeksAgo(30), NOW) },
  ].sort((a, b) => a.r.perWeek - b.r.perWeek);

  assert.deepEqual(
    rows.map((x) => x.id),
    ["apagado", "medio", "constante"],
    "el primer clic en la columna ordena ascendente y saca a quien menos viene",
  );
});

test("E14-09 · la ventana es un parámetro y la cifra viaja con ella", () => {
  const ocho = memberRhythm(8, weeksAgo(52), NOW, 8);
  const cuatro = memberRhythm(8, weeksAgo(52), NOW, 4);
  assert.equal(ocho.perWeek, 1);
  assert.equal(cuatro.perWeek, 2);
  assert.notEqual(ocho.weeks, cuatro.weeks, "sin la ventana, las dos cifras no se pueden comparar");
});
