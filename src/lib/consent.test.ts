import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLeadPrivacyNotice,
  canUseClinicalDataForAI,
  LEAD_CONSENT_VERSION,
  LEAD_HEALTH_CONSENT_LABEL,
  LEAD_HEALTH_MINIMISED_DESCRIPTION,
  LEAD_MARKETING_CONSENT_LABEL,
  needsReconsent,
  resolveLeadHealthCapture,
} from "./consent";

/**
 * E10-01, escenario principal ("sin casilla marcada"): el fallo original era
 * que el formulario público estampaba `consentSignedAt` sobre un consentimiento
 * que nadie había prestado. La prueba fija las dos mitades: sin casilla no hay
 * dato de salud, y con casilla la firma sale con la versión del texto.
 */
test("sin la casilla de salud marcada no se captura ningún dato de salud", () => {
  const capture = resolveLeadHealthCapture({ hasCondition: true, healthConsent: false });
  assert.deepEqual(capture, { capture: false, reason: "sin_consentimiento" });
});

test("con la casilla marcada la firma lleva fecha y versión de consentimiento", () => {
  const now = new Date("2026-09-06T10:00:00.000Z");
  const capture = resolveLeadHealthCapture({ hasCondition: true, healthConsent: true, now });
  assert.deepEqual(capture, {
    capture: true,
    description: LEAD_HEALTH_MINIMISED_DESCRIPTION,
    consentSignedAt: now,
    consentVersion: LEAD_CONSENT_VERSION,
  });
});

test("responder que no hay lesión no genera un registro de salud vacío", () => {
  for (const hasCondition of [false, null]) {
    const capture = resolveLeadHealthCapture({ hasCondition, healthConsent: true });
    assert.deepEqual(capture, { capture: false, reason: "sin_condicion" });
  }
});

/**
 * Minimización: lo que se guarda desde internet es un marcador para la
 * valoración presencial, no el relato clínico que escribiera el interesado.
 */
test("la descripción capturada es la frase minimizada, no texto libre", () => {
  const capture = resolveLeadHealthCapture({ hasCondition: true, healthConsent: true });
  assert.equal(capture.capture, true);
  assert.equal(capture.capture && capture.description, LEAD_HEALTH_MINIMISED_DESCRIPTION);
});

test("la casilla de salud y la comercial son textos distintos", () => {
  assert.notEqual(LEAD_HEALTH_CONSENT_LABEL, LEAD_MARKETING_CONSENT_LABEL);
});

/** Art. 13: la capa informativa nombra responsable, finalidad, base y política. */
test("la capa informativa cubre los cuatro extremos del art. 13", () => {
  const notice = buildLeadPrivacyNotice("Training Zone");
  assert.match(notice.responsable, /Training Zone/);
  assert.ok(notice.finalidad.length > 0);
  assert.match(notice.baseJuridica, /9\.2\.a/);
  assert.equal(notice.politicaUrl, "/privacidad");
});

/** La versión de captación no puede confundirse con la del contrato del socio. */
test("el consentimiento del lead tiene su propia versión", () => {
  assert.equal(needsReconsent({ consentVersion: LEAD_CONSENT_VERSION }), true);
});

test("la IA sigue exigiendo los dos permisos", () => {
  assert.equal(canUseClinicalDataForAI({ consentAI: true, consentHealth: false }), false);
  assert.equal(canUseClinicalDataForAI({ consentAI: true, consentHealth: true }), true);
});
