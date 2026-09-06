import test from "node:test";
import assert from "node:assert/strict";
import { conditionLabel, resolveAptitude, worstLight } from "@/lib/aptitude-light";
import type { BriefCondition, BriefRule } from "@/lib/brief-queries";

/**
 * E3-03 · Reglas de aptitud por condición, con ámbar por defecto.
 *
 * Lo que aquí se prueba es el motor: una condición declarada SIN regla enciende
 * ámbar en vez de dejar al socio en "Sin restricciones", y con varias manda la
 * más restrictiva. (El segundo tipo de regla —condición → luz + adaptación, con
 * su catálogo de partida— necesita una columna en `AptitudeRule` y el esquema
 * está congelado este trimestre: queda pedido al integrador.)
 */

function condicion(over: Partial<BriefCondition> = {}): BriefCondition {
  return { zone: null, zoneCode: null, side: null, description: "", type: "CHRONIC_CONDITION", ...over };
}

function regla(over: Partial<BriefRule> = {}): BriefRule {
  return {
    injuryZone: "Hombro",
    zoneCode: "HOMBRO",
    side: null,
    blockArea: "Empuje vertical",
    light: "RED",
    adaptation: null,
    ...over,
  };
}

test("E3-03 · una condición declarada sin ninguna regla es AMBER, nunca GREEN", () => {
  // Hipertensión, embarazo, diabetes: se guardan con zona nula, así que hoy no
  // hay regla que casar. Antes salían como "Sin restricciones".
  const hipertension = condicion({ description: "Hipertensión controlada" });

  const outcome = resolveAptitude([hipertension], []);

  assert.equal(outcome.light, "AMBER");
  assert.equal(outcome.matchedRules.length, 0);
  assert.deepEqual(outcome.unmatchedConditions, [hipertension]);
});

test("E3-03 · sin ninguna condición, y solo entonces, no hay luz", () => {
  const outcome = resolveAptitude([], [regla()]);
  assert.equal(outcome.light, null, '"Sin restricciones" vuelve a significar lo que dice');
  assert.equal(outcome.unmatchedConditions.length, 0);
});

test("E3-03 · con condición ámbar y lesión roja manda la más restrictiva", () => {
  const embarazo = condicion({ type: "PREGNANCY", description: "Segundo trimestre" });
  const hombro = condicion({ type: "INJURY", zoneCode: "HOMBRO", side: "DERECHA", description: "Tendinopatía" });

  const outcome = resolveAptitude([embarazo, hombro], [regla({ light: "RED" })]);

  assert.equal(outcome.light, "RED");
  assert.equal(outcome.matchedRules.length, 1, "la lesión sí encuentra su regla");
  assert.deepEqual(outcome.unmatchedConditions, [embarazo], "y el embarazo sigue siendo el motivo del ámbar");
});

test("E3-03 · la regla verde no apaga el ámbar de otra condición sin regla", () => {
  const asma = condicion({ description: "Asma leve" });
  const rodilla = condicion({ type: "INJURY", zoneCode: "RODILLA", side: "IZQUIERDA", description: "Menisco" });

  const outcome = resolveAptitude(
    [asma, rodilla],
    [regla({ zoneCode: "RODILLA", blockArea: "Tren superior", light: "GREEN" })]
  );

  assert.equal(outcome.light, "AMBER");
});

test("E3-03 · la luz peor gana, sea cual sea el orden", () => {
  assert.equal(worstLight(null, "GREEN"), "GREEN");
  assert.equal(worstLight("GREEN", "AMBER"), "AMBER");
  assert.equal(worstLight("RED", "AMBER"), "RED");
  assert.equal(worstLight("AMBER", "RED"), "RED");
});

test("E3-03 · el brief nombra la condición, no la describe", () => {
  assert.equal(
    conditionLabel(condicion({ type: "MEDICATION", description: "Sintrom 4 mg" })),
    "Medicación",
    "el nombre del fármaco no se pinta en una tarjeta abierta en la sala"
  );
  assert.equal(
    conditionLabel(condicion({ type: "INJURY", zoneCode: "HOMBRO", side: "DERECHA" })),
    "Lesión · Hombro derecho"
  );
});
