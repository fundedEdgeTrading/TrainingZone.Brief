import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import { FlowBranch } from "@prisma/client";
import { FLOW_BRANCHES, FLOW_TRIGGER_LABEL, FLOW_TRIGGER_SIGNAL, FLOW_TRIGGER_TYPES } from "./catalog";
import { MAX_STEPS_PER_BRANCH, validateFlow, type FlowDraft, type FlowDraftStep } from "./validate";

/**
 * E14-28 · Que NO se pueda construir un flujo inválido, y que eso se compruebe
 * en el SERVIDOR. Estas pruebas son las del servidor: el formulario puede
 * ayudar, pero no es la garantía.
 */

function emailStep(overrides: Partial<FlowDraftStep> = {}): FlowDraftStep {
  return {
    branch: "MAIN",
    position: 0,
    waitDays: 0,
    actionType: "SEND_EMAIL",
    actionConfig: { subject: "Bienvenido", bodyText: "Hola." },
    branchAfterDays: null,
    ...overrides,
  };
}

function draft(overrides: Partial<FlowDraft> = {}): FlowDraft {
  return {
    name: "Bienvenida",
    centerId: "center-1",
    triggerType: "MEMBER_JOINED",
    triggerConfig: {},
    conditions: [],
    steps: [emailStep()],
    ...overrides,
  };
}

function errors(d: FlowDraft): string[] {
  const result = validateFlow(d);
  return result.ok ? [] : result.issues.map((i) => i.message);
}

// ---------------------------------------------------------------------------
// Los catálogos son cerrados
// ---------------------------------------------------------------------------

test("las ramas son tres más el tronco, y «si abre» NO existe (D-L3-4)", () => {
  // Medir aperturas exige un píxel de traza y con él un CMP entero. La decisión
  // está cerrada: la rama de negocio «si abre» es «si hace clic».
  assert.deepEqual(Object.values(FlowBranch).sort(), ["MAIN", "ON_CLICK", "ON_NO_REPLY", "ON_REPLY"]);
  assert.equal(FLOW_BRANCHES.length, 4);
  const nombres = Object.values(FlowBranch).join(" ").toUpperCase();
  assert.ok(!nombres.includes("OPEN"), "no puede existir una rama de apertura");
});

test("los diez disparadores tienen rótulo y, sobre todo, señal documentada", () => {
  // Si un disparador no tiene señal escrita es que alguien la iba a
  // recalcular: exactamente lo que este módulo no debe hacer.
  for (const trigger of FLOW_TRIGGER_TYPES) {
    assert.ok(FLOW_TRIGGER_LABEL[trigger], `falta rótulo de ${trigger}`);
    assert.ok(FLOW_TRIGGER_SIGNAL[trigger]?.length > 20, `falta señal de ${trigger}`);
  }
});

// ---------------------------------------------------------------------------
// Lo mínimo
// ---------------------------------------------------------------------------

test("el flujo de control es válido", () => {
  assert.deepEqual(errors(draft()), []);
});

test("sin nombre, sin centro o sin pasos no se guarda", () => {
  assert.ok(errors(draft({ name: " " })).length > 0);
  assert.ok(errors(draft({ centerId: "" })).length > 0);
  assert.ok(errors(draft({ steps: [] })).length > 0);
});

test("un flujo sin tronco no se guarda: las ramas colgarían de nada", () => {
  const sinTronco = draft({ steps: [emailStep({ branch: "ON_CLICK" })] });
  assert.ok(errors(sinTronco).some((m) => m.includes("tronco")));
});

// ---------------------------------------------------------------------------
// DISPARADOR
// ---------------------------------------------------------------------------

test("el disparador con N necesita su N, entera y dentro de rango", () => {
  const base = { triggerType: "PACK_BALANCE_BELOW" as const };
  assert.ok(errors(draft({ ...base, triggerConfig: {} })).length > 0, "sin N no vale");
  assert.ok(errors(draft({ ...base, triggerConfig: { threshold: 0 } })).length > 0, "cero no vale");
  assert.ok(errors(draft({ ...base, triggerConfig: { threshold: 2.5 } })).length > 0, "decimal no vale");
  assert.deepEqual(errors(draft({ ...base, triggerConfig: { threshold: 2 } })), []);
});

test("«cambio de estado» necesita saber a qué estado", () => {
  assert.ok(errors(draft({ triggerType: "MEMBER_STATE_CHANGED", triggerConfig: {} })).length > 0);
  assert.ok(errors(draft({ triggerType: "MEMBER_STATE_CHANGED", triggerConfig: { state: "PROSPECT" } })).length > 0);
  assert.deepEqual(errors(draft({ triggerType: "MEMBER_STATE_CHANGED", triggerConfig: { state: "DELINQUENT" } })), []);
});

// ---------------------------------------------------------------------------
// CONDICIÓN
// ---------------------------------------------------------------------------

test("la condición de etiqueta se guarda por CLAVE y no puede ir vacía", () => {
  assert.ok(errors(draft({ conditions: [{ type: "TAG", config: {}, negated: false }] })).length > 0);
  assert.deepEqual(
    errors(draft({ conditions: [{ type: "TAG", config: { tagKey: "grupo_reducido" }, negated: false }] })),
    []
  );
});

test("una condición de centro vacía no vale: «todos» tácito no existe", () => {
  assert.ok(errors(draft({ conditions: [{ type: "CENTER", config: { centerIds: [] }, negated: false }] })).length > 0);
});

test("la antigüedad se mide en meses enteros y con sentido", () => {
  const cond = (config: Record<string, unknown>) =>
    errors(draft({ conditions: [{ type: "TENURE", config, negated: false }] }));
  assert.ok(cond({ months: -1, direction: "min" }).length > 0);
  assert.ok(cond({ months: 6, direction: "aprox" }).length > 0);
  assert.deepEqual(cond({ months: 6, direction: "min" }), []);
});

test("una condición que cuelga de un paso inexistente no se guarda", () => {
  const d = draft({ conditions: [{ type: "TAG", config: { tagKey: "x" }, negated: false, stepIndex: 7 }] });
  assert.ok(errors(d).some((m) => m.includes("paso que no existe")));
});

// ---------------------------------------------------------------------------
// ESPERA
// ---------------------------------------------------------------------------

test("la espera son días enteros y no negativos", () => {
  assert.ok(errors(draft({ steps: [emailStep({ waitDays: -1 })] })).length > 0);
  assert.ok(errors(draft({ steps: [emailStep({ waitDays: 1.5 })] })).length > 0);
  assert.ok(errors(draft({ steps: [emailStep({ waitDays: 400 })] })).length > 0);
  assert.deepEqual(errors(draft({ steps: [emailStep({ waitDays: 30 })] })), []);
});

// ---------------------------------------------------------------------------
// ACCIÓN
// ---------------------------------------------------------------------------

test("cada acción exige lo suyo y nada más", () => {
  const con = (step: Partial<FlowDraftStep>) => errors(draft({ steps: [emailStep(step)] }));

  assert.ok(con({ actionType: "SEND_EMAIL", actionConfig: { subject: "", bodyText: "x" } }).length > 0);
  assert.ok(con({ actionType: "ADD_TAG", actionConfig: {} }).length > 0);
  assert.deepEqual(con({ actionType: "ADD_TAG", actionConfig: { tagKey: "embajador" } }), []);
  assert.ok(con({ actionType: "CHANGE_STATE", actionConfig: { state: "PROSPECT" } }).length > 0);
  assert.deepEqual(con({ actionType: "CHANGE_STATE", actionConfig: { state: "DELINQUENT" } }), []);
  assert.ok(con({ actionType: "CREATE_TASK", actionConfig: { title: "Llamar", dueInDays: -2 } }).length > 0);
  assert.deepEqual(con({ actionType: "CREATE_TASK", actionConfig: { title: "Llamar", dueInDays: 2 } }), []);
});

// ---------------------------------------------------------------------------
// RAMAS
// ---------------------------------------------------------------------------

test("una rama sin email en el tronco no se guarda: no se ejecutaría jamás", () => {
  const soloEtiqueta = draft({
    steps: [
      emailStep({ actionType: "ADD_TAG", actionConfig: { tagKey: "nuevo" } }),
      emailStep({ branch: "ON_CLICK", position: 0 }),
    ],
  });
  assert.ok(errors(soloEtiqueta).some((m) => m.includes("no se ejecuta nunca")));
});

test("«si no responde» necesita el X de «en X días», y solo esa rama lo tiene", () => {
  const sinX = draft({
    steps: [emailStep(), emailStep({ branch: "ON_NO_REPLY", position: 0, branchAfterDays: null })],
  });
  assert.ok(errors(sinX).some((m) => m.includes("no responde")));

  const conX = draft({
    steps: [emailStep(), emailStep({ branch: "ON_NO_REPLY", position: 0, branchAfterDays: 3 })],
  });
  assert.deepEqual(errors(conX), []);

  const enOtraRama = draft({
    steps: [emailStep(), emailStep({ branch: "ON_CLICK", position: 0, branchAfterDays: 3 })],
  });
  assert.ok(errors(enOtraRama).length > 0);
});

// ---------------------------------------------------------------------------
// Orden y tamaño
// ---------------------------------------------------------------------------

test("las posiciones de una rama son correlativas y no se repiten", () => {
  const repetidas = draft({ steps: [emailStep({ position: 0 }), emailStep({ position: 0 })] });
  assert.ok(errors(repetidas).some((m) => m.includes("desordenados o repetidos")));

  const conHueco = draft({ steps: [emailStep({ position: 0 }), emailStep({ position: 2 })] });
  assert.ok(errors(conHueco).some((m) => m.includes("desordenados o repetidos")));
});

test("una rama no puede crecer sin fin: el editor son cuatro piezas", () => {
  const muchos = draft({
    steps: Array.from({ length: MAX_STEPS_PER_BRANCH + 1 }, (_, i) => emailStep({ position: i })),
  });
  assert.ok(errors(muchos).some((m) => m.includes(String(MAX_STEPS_PER_BRANCH))));
});

test("el flujo válido vuelve con el nombre ya normalizado", () => {
  const result = validateFlow(draft({ name: "  Bienvenida  ", description: "  " }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.name, "Bienvenida");
  assert.equal(result.draft.description, null);
});
