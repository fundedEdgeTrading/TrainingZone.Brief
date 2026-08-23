import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { computeRetentionSignal, buildAlertContext } from "./retention";

const TODAY = new Date("2026-08-23T00:00:00.000Z");
const DAY = 86_400_000;

/** Asistencias cada `everyDays` días dentro de la ventana [from, to) contada hacia atrás desde hoy. */
function attendance(fromDaysAgo: number, toDaysAgo: number, everyDays: number): Date[] {
  const out: Date[] = [];
  for (let d = fromDaysAgo; d > toDaysAgo; d -= everyDays) {
    out.push(new Date(TODAY.getTime() - d * DAY));
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

test("sin hábito previo no hay señal: la línea base manda", () => {
  // Una visita cada 30 días ≈ 0,23/semana, por debajo del mínimo de 0,4.
  const dates = attendance(98, 14, 30);
  assert.equal(computeRetentionSignal(dates, TODAY), null);
});

test("quien mantiene su ritmo no genera alerta", () => {
  // Dos por semana en la base y dos por semana en las últimas dos.
  const dates = [...attendance(98, 14, 3.5), ...attendance(14, 0, 3.5)];
  assert.equal(computeRetentionSignal(dates, TODAY), null);
});

test("una caída del 60 % o más abre alerta media", () => {
  // Base: ~2/semana. Reciente: 1 sola visita en 14 días = 0,5/semana (-75 %).
  const dates = [...attendance(98, 14, 3.5), new Date(TODAY.getTime() - 10 * DAY)];
  const signal = computeRetentionSignal(dates, TODAY);
  assert.ok(signal, "debería haber señal");
  assert.equal(signal.riskLevel, "MEDIUM");
  assert.ok(signal.dropPct < 0, "la caída se guarda negativa");
  assert.ok(signal.dropPct <= -60 && signal.dropPct > -85, `caída inesperada: ${signal.dropPct}`);
});

test("desaparecer del todo es riesgo alto", () => {
  const dates = attendance(98, 14, 3.5); // nada en las últimas dos semanas
  const signal = computeRetentionSignal(dates, TODAY);
  assert.ok(signal, "debería haber señal");
  assert.equal(signal.riskLevel, "HIGH");
  assert.equal(signal.recentFreq, 0);
  assert.equal(signal.dropPct, -100);
});

/**
 * El bug que hacía inservible la pantalla retirada: `dropPct` se guarda negativo
 * y allí se pintaba como `-{dropPct}%`, que daba «--76%». Se fija el signo aquí
 * para que quien lo lea no lo vuelva a invertir.
 */
test("dropPct es negativo y ya incluye el signo", () => {
  const dates = attendance(98, 14, 3.5);
  const signal = computeRetentionSignal(dates, TODAY);
  assert.ok(signal);
  assert.equal(`${signal.dropPct}%`, "-100%");
});

test("la ventana reciente no se solapa con la línea base", () => {
  // Todas las visitas caen dentro de los últimos 14 días: no hay base, no hay señal.
  const dates = attendance(13, 0, 2);
  assert.equal(computeRetentionSignal(dates, TODAY), null);
});

test("el contexto cuenta desde cuándo no viene, sin datos de salud", () => {
  const dates = [new Date(TODAY.getTime() - 23 * DAY)];
  assert.equal(buildAlertContext(dates, TODAY), "Última clase hace 23 días.");
  assert.equal(buildAlertContext([], TODAY), "Sin asistencias registradas en las últimas semanas.");
});
