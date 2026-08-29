import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import {
  HEALTH_STATUSES,
  OPEN_HEALTH_STATUSES,
  formatElapsedSince,
  formatInjuryDate,
  fullMonthsBetween,
  injuryTimeline,
  isChronicHealthRecord,
  isChronicPhase,
  isOpenHealthStatus,
} from "./health-status";

/**
 * El tiempo transcurrido desde la lesión se deriva SIEMPRE en lectura, así que
 * lo único que hay que asegurar es que la frase que sale es la correcta para
 * cada distancia — y que una fecha aproximada (el socio solo dijo el mes) no
 * finge precisión de día.
 */

const NOW = new Date(2026, 7, 29, 12, 0, 0); // 29 de agosto de 2026
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("el tiempo transcurrido se cuenta en la unidad que toca", () => {
  assert.equal(formatElapsedSince(daysBefore(0), NOW), "hoy");
  assert.equal(formatElapsedSince(daysBefore(1), NOW), "ayer");
  assert.equal(formatElapsedSince(daysBefore(4), NOW), "hace 4 días");
  assert.equal(formatElapsedSince(daysBefore(9), NOW), "hace 1 semana");
  assert.equal(formatElapsedSince(daysBefore(20), NOW), "hace 2 semanas");
});

test("a partir del mes cumplido se habla de meses, no de semanas", () => {
  assert.equal(formatElapsedSince(new Date(2026, 6, 29), NOW), "hace 1 mes");
  assert.equal(formatElapsedSince(new Date(2026, 4, 29), NOW), "hace 3 meses");
  assert.equal(formatElapsedSince(new Date(2026, 4, 30), NOW), "hace 2 meses", "el mes no está cumplido");
});

test("más de un año se dice en años y meses", () => {
  assert.equal(formatElapsedSince(new Date(2025, 7, 29), NOW), "hace 1 año");
  assert.equal(formatElapsedSince(new Date(2025, 4, 29), NOW), "hace 1 año y 3 meses");
  assert.equal(formatElapsedSince(new Date(2023, 7, 29), NOW), "hace 3 años");
});

test("una fecha aproximada nunca habla de días", () => {
  // Mismo día que arriba daría "ayer"; con el día de relleno sería inventárselo.
  assert.equal(formatElapsedSince(daysBefore(1), NOW, true), "este mes");
  assert.equal(formatElapsedSince(new Date(2026, 4, 1), NOW, true), "hace 3 meses");
  assert.equal(formatElapsedSince(new Date(2024, 1, 1), NOW, true), "hace 2 años y 6 meses");
});

test("una fecha futura no se convierte en un 'dentro de'", () => {
  assert.equal(formatElapsedSince(new Date(2026, 9, 1), NOW), "hoy");
});

test("los meses se cuentan por calendario, no dividiendo días", () => {
  // Febrero (28 días) y marzo (31) valen un mes cada uno.
  assert.equal(fullMonthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 28)), 0);
  assert.equal(fullMonthsBetween(new Date(2026, 0, 15), new Date(2026, 2, 15)), 2);
});

test("la fecha se enseña con la precisión con la que se capturó", () => {
  assert.equal(formatInjuryDate(new Date(2026, 4, 14)), "14/05/2026");
  assert.equal(formatInjuryDate(new Date(2026, 4, 1), true), "mayo de 2026");
});

test("sin fecha de lesión se dice, y se cae a la fecha de registro", () => {
  const timeline = injuryTimeline(
    { injuryDate: null, injuryDateApprox: false, reportedAt: daysBefore(40) },
    NOW
  );
  assert.equal(timeline.label, "Fecha de lesión no registrada");
  assert.equal(timeline.elapsed, "hace 1 mes");
  assert.equal(timeline.exact, false);
});

test("con fecha de lesión, el transcurrido sale de ella y no de reportedAt", () => {
  const timeline = injuryTimeline(
    // Registrada ayer, pero la lesión es de hace tres meses.
    { injuryDate: new Date(2026, 4, 29), injuryDateApprox: false, reportedAt: daysBefore(1) },
    NOW
  );
  assert.equal(timeline.elapsed, "hace 3 meses");
  assert.equal(timeline.label, "Lesión 29/05/2026");
  assert.equal(timeline.exact, true);
});

test("vigente no es lo mismo que activa: solo RESOLVED apaga el registro", () => {
  assert.deepEqual(OPEN_HEALTH_STATUSES, ["ACTIVE", "IN_REHAB", "CHRONIC"]);
  assert.equal(isOpenHealthStatus("ACTIVE"), true);
  assert.equal(isOpenHealthStatus("IN_REHAB"), true);
  assert.equal(isOpenHealthStatus("CHRONIC"), true);
  assert.equal(isOpenHealthStatus("RESOLVED"), false);
  // Las cuatro fases se ofrecen en la UI; ninguna se queda sin rótulo.
  assert.deepEqual(HEALTH_STATUSES, ["ACTIVE", "IN_REHAB", "RESOLVED", "CHRONIC"]);
});

test("crónico se pregunta en un único sitio y cubre las dos formas de serlo", () => {
  assert.equal(isChronicHealthRecord({ type: "INJURY", status: "CHRONIC" }), true);
  assert.equal(isChronicHealthRecord({ type: "CHRONIC_CONDITION", status: "ACTIVE" }), true);
  assert.equal(isChronicHealthRecord({ type: "INJURY", status: "ACTIVE" }), false);
  // Una condición crónica superada deja de contar: manda la fase.
  assert.equal(isChronicHealthRecord({ type: "CHRONIC_CONDITION", status: "RESOLVED" }), false);
});

test("el aviso de la ficha solo lo enciende la fase CHRONIC", () => {
  // La captura de salud del lead escribe CHRONIC_CONDITION incluso para
  // «ninguna»: si contara, media base de socios tendría aviso permanente.
  assert.equal(isChronicPhase({ status: "CHRONIC" }), true);
  assert.equal(isChronicPhase({ status: "ACTIVE" }), false);
});
