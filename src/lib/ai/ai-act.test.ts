import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_LITERACY_POINTS,
  AI_LITERACY_VERSION,
  aiGeneratedLabel,
  MESOCYCLE_AI_CLASSIFICATION,
} from "./ai-act";

/**
 * E10-17, escenario principal (art. 50, en vigor desde el 2/8/2026): todo
 * mesociclo generado muestra "Propuesta generada con IA · revisada por X".
 * La marca dice las DOS cosas: de dónde salió y quién responde de ello.
 */
test("un mesociclo aprobado se marca como generado con IA y revisado por quien lo firmó", () => {
  const label = aiGeneratedLabel({ reviewerName: "Sergio Marín", approved: true });
  assert.equal(label, "Propuesta generada con IA · revisada por Sergio Marín");
});

test("un borrador dice que está pendiente de revisión, nunca que lo revisó nadie", () => {
  assert.match(aiGeneratedLabel({ reviewerName: "Sergio", approved: false }), /pendiente de revisión/);
  assert.match(aiGeneratedLabel({ reviewerName: null, approved: true }), /pendiente de revisión/);
  assert.match(aiGeneratedLabel({ reviewerName: "   ", approved: true }), /pendiente de revisión/);
});

test("la marca siempre dice que hay IA detrás, esté aprobado o no", () => {
  for (const approved of [true, false]) {
    assert.match(aiGeneratedLabel({ reviewerName: "Ana", approved }), /generada con IA/);
  }
});

/** Escenario "documento de clasificación": razonada y con su fecha. */
test("la clasificación es de riesgo limitado, está fechada y razona cada supuesto", () => {
  assert.equal(MESOCYCLE_AI_CLASSIFICATION.riskLevel, "limitado");
  assert.match(MESOCYCLE_AI_CLASSIFICATION.classifiedOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(MESOCYCLE_AI_CLASSIFICATION.reasoning.length >= 4);
  assert.ok(MESOCYCLE_AI_CLASSIFICATION.document.endsWith(".md"));
});

/**
 * Escenario "revisión de la clasificación": si el mesociclo llegara al socio
 * sin revisión humana, se reabre — y con ella el art. 22 RGPD.
 */
test("el análisis dice qué lo reabriría, incluido el art. 22 RGPD", () => {
  const reopen = MESOCYCLE_AI_CLASSIFICATION.reopenIf.join(" ");
  assert.match(reopen, /sin revisión humana/i);
  assert.match(reopen, /art\. 22/);
});

/** Escenario "lo que ya cumple": DRAFT por defecto y aprobación humana. */
test("el razonamiento recoge que la propuesta nace en DRAFT y no llega al socio sin firma", () => {
  const reasoning = MESOCYCLE_AI_CLASSIFICATION.reasoning.join(" ");
  assert.match(reasoning, /DRAFT/);
  assert.match(reasoning, /aprue/i);
});

/** Escenario "formación del art. 4": hay contenido y está versionado. */
test("los puntos de alfabetización existen y van versionados", () => {
  assert.ok(AI_LITERACY_POINTS.length >= 5);
  for (const point of AI_LITERACY_POINTS) assert.ok(point.trim().length > 20);
  assert.match(AI_LITERACY_VERSION, /^\d{4}-\d{2}-v\d+$/);
});

test("la obligación del art. 4 y la del art. 50 constan como aplicables hoy", () => {
  const obligations = MESOCYCLE_AI_CLASSIFICATION.obligations.join(" ");
  assert.match(obligations, /Art\. 50/);
  assert.match(obligations, /Art\. 4/);
});
