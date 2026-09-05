import { test } from "node:test";
import assert from "node:assert/strict";

import { buildRefineRequest, parseRefineRequest } from "./mesocycle-prompt";
import type { MesocyclePlan } from "./mesocycle-schema";

/**
 * El historial de «Refinar con IA» no tiene tabla propia: sale de leer al revés
 * los mensajes `user` que guarda `Mesocycle.aiConversation`. Estas pruebas
 * sujetan las dos mitades de esa ida y vuelta, que es lo que se rompería en
 * silencio el día que cambie el prompt: la pantalla seguiría cargando, solo que
 * con el historial vacío.
 */

const PLAN: MesocyclePlan = {
  title: "Reconstrucción de base tras lesión de hombro",
  objective: "Recuperar fuerza de empuje sin dolor.",
  profile: "REHABILITACION",
  safetyCriteria: ["Sin press por encima de la cabeza hasta la semana 5"],
  weeklyLayout: ["Lun TZ", "Mié Gym"],
  milestones: [{ week: 4, milestone: "Remo con mancuerna 3×10 a 16 kg" }],
  phases: [],
};

test("parseRefineRequest recupera la petición que metió buildRefineRequest", () => {
  const request = "Cambia la fase 2, no me gusta el broad jump";
  assert.equal(parseRefineRequest(buildRefineRequest(PLAN, request)), request);
});

test("parseRefineRequest respeta las peticiones de varias líneas", () => {
  const request = "Quita el press militar.\nY sube a cuatro series la tracción.";
  assert.equal(parseRefineRequest(buildRefineRequest(PLAN, request)), request);
});

test("parseRefineRequest descarta el briefing de generación, que no lleva marcador", () => {
  assert.equal(parseRefineRequest("Programa el mesociclo de este socio.\n\n## Perfil\n- Edad: 41"), null);
});

test("parseRefineRequest no confunde el marcador dentro del plan con el final del mensaje", () => {
  // El plan viaja como JSON en el mismo mensaje: si un texto del socio incluyera
  // el literal del marcador, la petición real sigue siendo la última.
  const trap: MesocyclePlan = { ...PLAN, objective: "Cambio pedido por el entrenador: nada" };
  assert.equal(parseRefineRequest(buildRefineRequest(trap, "Sube el volumen del viernes")), "Sube el volumen del viernes");
});

test("parseRefineRequest devuelve null si la petición viene vacía", () => {
  assert.equal(parseRefineRequest(buildRefineRequest(PLAN, "   ")), null);
});
