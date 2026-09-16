import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import { matchesAllConditions, matchesCondition, tenureMonths, type FlowMemberFacts } from "./conditions";

/**
 * Las condiciones deciden sobre un FOTOGRAMA del socio, igual que las reglas de
 * etiquetas de E1: salen de la base de datos una vez y se evalúan sin volver a
 * consultar. Por eso se prueban aquí sin base de datos.
 */

const NOW = new Date("2026-09-16T09:00:00.000Z");
const DAY = 86_400_000;

function facts(overrides: Partial<FlowMemberFacts> = {}): FlowMemberFacts {
  return {
    memberId: "m1",
    centerId: "center-1",
    state: "ACTIVE",
    joinedAt: new Date(NOW.getTime() - 400 * DAY),
    planTypes: ["MONTHLY"],
    tagKeys: ["grupo_reducido"],
    trainerUserIds: ["trainer-1"],
    ...overrides,
  };
}

test("centro: solo entra quien es de los centros elegidos", () => {
  const cond = { type: "CENTER" as const, config: { centerIds: ["center-1"] }, negated: false };
  assert.equal(matchesCondition(cond, facts(), NOW), true);
  assert.equal(matchesCondition(cond, facts({ centerId: "center-2" }), NOW), false);
});

test("etiqueta: se pregunta por clave, nunca por rótulo", () => {
  const cond = { type: "TAG" as const, config: { tagKey: "grupo_reducido" }, negated: false };
  assert.equal(matchesCondition(cond, facts(), NOW), true);
  // El rótulo («Grupo reducido») no vale: renombrarlo en /etiquetas dejaría la
  // condición apuntando a nada, y por eso el contrato con E1 es por clave.
  const porRotulo = { type: "TAG" as const, config: { tagKey: "Grupo reducido" }, negated: false };
  assert.equal(matchesCondition(porRotulo, facts(), NOW), false);
});

test("negated invierte: «NO tiene la etiqueta X» sin necesitar un flujo por etiqueta", () => {
  const cond = { type: "TAG" as const, config: { tagKey: "impago" }, negated: true };
  assert.equal(matchesCondition(cond, facts(), NOW), true);
  assert.equal(matchesCondition(cond, facts({ tagKeys: ["impago"] }), NOW), false);
});

test("tipo de plan: basta con que uno de los suyos encaje", () => {
  const cond = { type: "PLAN_TYPE" as const, config: { planTypes: ["PERSONAL_TRAINING"] }, negated: false };
  assert.equal(matchesCondition(cond, facts({ planTypes: ["MONTHLY", "PERSONAL_TRAINING"] }), NOW), true);
  assert.equal(matchesCondition(cond, facts({ planTypes: ["MONTHLY"] }), NOW), false);
  assert.equal(matchesCondition(cond, facts({ planTypes: [] }), NOW), false);
});

test("antigüedad: «al menos» y «como mucho» son la misma condición en dos sentidos", () => {
  const nuevo = facts({ joinedAt: new Date(NOW.getTime() - 20 * DAY) });
  assert.equal(matchesCondition({ type: "TENURE", config: { months: 6, direction: "min" }, negated: false }, nuevo, NOW), false);
  assert.equal(matchesCondition({ type: "TENURE", config: { months: 6, direction: "max" }, negated: false }, nuevo, NOW), true);
  assert.equal(tenureMonths(nuevo.joinedAt, NOW), 0);
});

test("entrenador: el socio entrena con varios y basta con uno de los elegidos", () => {
  const cond = { type: "TRAINER" as const, config: { trainerUserIds: ["trainer-2"] }, negated: false };
  assert.equal(matchesCondition(cond, facts({ trainerUserIds: ["trainer-1", "trainer-2"] }), NOW), true);
  assert.equal(matchesCondition(cond, facts(), NOW), false);
});

test("todas las condiciones se cumplen a la vez: un O lógico son dos flujos", () => {
  const conds = [
    { type: "CENTER" as const, config: { centerIds: ["center-1"] }, negated: false },
    { type: "TAG" as const, config: { tagKey: "grupo_reducido" }, negated: false },
  ];
  assert.equal(matchesAllConditions(conds, facts(), NOW), true);
  assert.equal(matchesAllConditions(conds, facts({ tagKeys: [] }), NOW), false);
});

test("sin condiciones, entra todo el que dispare", () => {
  assert.equal(matchesAllConditions([], facts(), NOW), true);
});
